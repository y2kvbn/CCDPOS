/* ========================================================================
 * pos.js - POS 收銀
 * ======================================================================== */
const POS = (() => {
  const PLACEHOLDER_PHOTO = 'images/product-placeholder.jpg';
  let cart = [];
  let search = '';
  let category = 'all';
  let reservationId = null;
  let enrollmentId = null;
  let memberId = null;
  let discount = 0;
  let discountReason = '';
  let pointsToRedeem = 0;
  let appliedCampaignId = null;
  let isSubmitting = false;

  function root() { return document.getElementById('view-pos'); }

  // 美容／寄養／安親屬於服務類，一律透過「訂單管理」建立預約後用「轉POS結帳」帶入購物車
  // （見 loadReservation()），不再讓店員直接從 POS 商品格選購，避免跟預約流程重複/混淆。
  function allCatalogItems() {
    const s = DB.state;
    return s.products.filter((p) => p.enabled).map((p) => ({
      key: 'product-' + p.id, type: 'product', refId: p.id, name: p.name, price: p.price,
      cost: p.cost, category: p.category, stock: p.stock, barcode: p.barcode, unit: p.unit,
      low: p.stock <= p.safetyStock, photo: p.photo || '',
    }));
  }

  function categories() {
    const items = allCatalogItems();
    const set = new Set(items.map((i) => i.category));
    return ['all', ...Array.from(set)];
  }

  function filteredItems() {
    let items = allCatalogItems();
    if (category !== 'all') items = items.filter((i) => i.category === category);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(q) || (i.barcode && i.barcode.includes(q)));
    }
    return items;
  }

  function subtotal() {
    return cart.reduce((sum, c) => sum + c.price * c.qty, 0);
  }
  function boundMember() {
    return memberId ? DB.state.members.find((m) => m.id === memberId) : null;
  }
  /** 會員集點政策是否啟用（設定頁「會員集點與折抵政策」，預設關閉，不影響現有結帳流程） */
  function loyaltyEnabled() {
    return !!DB.state.meta.loyaltyPolicy.enabled;
  }
  /** 目前可折抵的最大點數：不超過會員持有點數，也不超過折抵後仍需 >= 0 的範圍。 */
  function maxRedeemablePoints() {
    if (!loyaltyEnabled()) return 0;
    const m = boundMember();
    if (!m || !m.points) return 0;
    const policy = DB.state.meta.loyaltyPolicy;
    const remainAfterDiscount = Math.max(0, subtotal() - discount);
    const maxByAmount = Math.floor(remainAfterDiscount * policy.redeemPointsPerDollar);
    return Math.max(0, Math.min(m.points, maxByAmount));
  }
  function pointsRedeemValue() {
    const policy = DB.state.meta.loyaltyPolicy;
    return pointsToRedeem > 0 ? pointsToRedeem / policy.redeemPointsPerDollar : 0;
  }
  /** 目前日期在有效期間內、已啟用、且達最低消費門檻與未達使用次數上限的優惠活動。 */
  function activeCampaigns() {
    const today = DB.todayStr();
    const st = subtotal();
    return DB.state.discountCampaigns.filter((c) => c.enabled && c.startDate <= today && today <= c.endDate
      && st >= (c.minSpend || 0) && (c.usageLimit === null || (c.usedCount || 0) < c.usageLimit));
  }
  function total() {
    return Math.max(0, subtotal() - discount - pointsRedeemValue());
  }
  function discountPercent() {
    const st = subtotal();
    return st > 0 ? (discount / st) * 100 : 0;
  }
  /** BUG-009：折扣防弊政策檢查（門檻由「設定」頁配置，預設不限制） */
  function discountNeedsApproval() {
    const policy = DB.state.meta.discountPolicy;
    if (!policy || !policy.managerApprovalRequired) return false;
    return discountPercent() > policy.maxDiscountPercent;
  }

  function addToCart(type, refId) {
    const item = allCatalogItems().find((i) => i.type === type && i.refId === refId);
    if (!item) return;
    if (item.type === 'product' && item.stock <= 0) { Utils.toast('此商品庫存不足', 'error'); return; }
    const existing = cart.find((c) => c.type === type && c.refId === refId);
    if (existing) {
      if (item.type === 'product' && existing.qty + 1 > item.stock) { Utils.toast('已達庫存上限', 'error'); return; }
      existing.qty += 1;
    } else {
      cart.push({ type: item.type, refId: item.refId, name: item.name, price: item.price, cost: item.cost, qty: 1, maxStock: item.stock, unit: item.unit });
    }
    renderCart();
    renderCatalogGrid();
  }

  function changeQty(idx, delta) {
    const row = cart[idx];
    if (!row) return;
    const next = row.qty + delta;
    if (next <= 0) { cart.splice(idx, 1); }
    else if (row.type === 'product' && row.maxStock !== null && next > row.maxStock) { Utils.toast('已達庫存上限', 'error'); return; }
    else row.qty = next;
    renderCart();
    renderCatalogGrid();
  }

  function setQty(idx, val) {
    const row = cart[idx];
    if (!row) return;
    let n = parseInt(val, 10);
    if (isNaN(n) || n < 1) n = 1;
    if (row.type === 'product' && row.maxStock !== null && n > row.maxStock) n = row.maxStock;
    row.qty = n;
    renderCart();
  }

  function removeRow(idx) {
    cart.splice(idx, 1);
    renderCart();
    renderCatalogGrid();
  }

  function clearCart(silent) {
    cart = [];
    discount = 0;
    discountReason = '';
    pointsToRedeem = 0;
    appliedCampaignId = null;
    reservationId = null;
    enrollmentId = null;
    memberId = null;
    if (!silent) renderAll();
  }

  function loadReservation(orderId) {
    const order = DB.state.reservations.find((g) => g.id === orderId);
    if (!order) return;
    clearCart(true);
    reservationId = order.id;
    const mult = Reservations.multiplier(order);
    order.serviceIds.forEach((sid) => {
      const sv = DB.state.services.find((s) => s.id === sid);
      if (!sv) return;
      const existing = cart.find((c) => c.type === 'service' && c.refId === sid);
      if (existing) existing.qty += mult;
      else cart.push({ type: 'service', refId: sid, name: sv.name, price: sv.price, cost: sv.cost, qty: mult, maxStock: null, unit: sv.priceUnit });
    });
    App.go('pos');
  }

  function loadEnrollment(enrollId) {
    const enrollment = DB.state.enrollments.find((e) => e.id === enrollId);
    if (!enrollment) return;
    const course = DB.state.courses.find((c) => c.id === enrollment.courseId);
    if (!course) { Utils.toast('找不到對應課程', 'error'); return; }
    clearCart(true);
    enrollmentId = enrollment.id;
    cart.push({ type: 'course', refId: course.id, name: `${course.name}（${enrollment.studentName}）`, price: course.price, cost: course.cost, qty: 1, maxStock: null, unit: '人' });
    App.go('pos');
  }

  function renderCatalogGrid() {
    const grid = document.getElementById('pos-catalog-grid');
    if (!grid) return;
    const items = filteredItems();
    if (!items.length) {
      grid.innerHTML = `<div class="empty-state"><div class="icon">🔍</div>找不到符合的商品/服務</div>`;
      return;
    }
    grid.innerHTML = items.map((i) => {
      const inCart = cart.find((c) => c.type === i.type && c.refId === i.refId);
      const disabled = i.stock <= 0;
      return `
      <button class="pos-product-card ${i.low ? 'low' : ''}" data-type="${i.type}" data-id="${i.refId}" ${disabled ? 'disabled' : ''}>
        ${i.low ? '<span class="lowtag badge yellow">低庫存</span>' : ''}
        <img class="pcard-photo" src="${i.photo || PLACEHOLDER_PHOTO}" alt="">
        <div class="pcard-body">
          <div class="pname">${Utils.escapeHtml(i.name)}</div>
          <div class="pstock">庫存 ${i.stock} ${i.unit || ''}${inCart ? ' · 已選 ' + inCart.qty : ''}</div>
          <div class="pprice">${Utils.money(i.price)}</div>
        </div>
      </button>`;
    }).join('');
  }

  function renderMemberBanner() {
    const memberBanner = document.getElementById('pos-member-banner');
    if (!memberBanner) return;
    if (memberId) {
      const m = DB.state.members.find((mm) => mm.id === memberId);
      if (m) {
        memberBanner.className = 'badge teal';
        memberBanner.style.cssText = 'margin:8px 12px 0;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;';
        memberBanner.innerHTML = `<span>👤 會員：${Utils.escapeHtml(m.name)}${m.phone ? `（${Utils.escapeHtml(m.phone)}）` : ''} · 儲值 ${Utils.money(m.balance || 0)}</span><button class="link-btn" id="btn-unlink-member">取消綁定</button>`;
        return;
      }
      memberId = null;
    }
    memberBanner.className = '';
    memberBanner.style.cssText = 'margin:8px 12px 0;';
    memberBanner.innerHTML = `<button class="btn sm" id="btn-pick-member" style="width:100%;">＋ 綁定會員</button>`;
  }

  function renderCart() {
    const list = document.getElementById('pos-cart-list');
    const sumBox = document.getElementById('pos-summary');
    const banner = document.getElementById('pos-link-banner');
    if (!list) return;

    renderMemberBanner();

    if (banner) {
      if (reservationId) {
        const order = DB.state.reservations.find((g) => g.id === reservationId);
        banner.hidden = false;
        banner.innerHTML = `<span>🔗 結帳來源：${order ? Utils.escapeHtml(`[${order.category}] ${order.no} · ${order.petName}`) : ''}</span><button class="link-btn" id="btn-unlink">取消關聯</button>`;
      } else if (enrollmentId) {
        const enrollment = DB.state.enrollments.find((e) => e.id === enrollmentId);
        banner.hidden = false;
        banner.innerHTML = `<span>🔗 結帳來源：${enrollment ? Utils.escapeHtml(`[課程報名] ${enrollment.no} · ${enrollment.studentName}`) : ''}</span><button class="link-btn" id="btn-unlink">取消關聯</button>`;
      } else {
        banner.hidden = true;
      }
    }

    if (!cart.length) {
      list.innerHTML = `<div class="cart-empty">🛒<br>購物車是空的<br>點選左側商品或服務加入</div>`;
    } else {
      list.innerHTML = cart.map((c, idx) => `
        <div class="cart-row" data-idx="${idx}">
          <div style="flex:1">
            <div class="ci-name">${Utils.escapeHtml(c.name)}</div>
            <div class="ci-price">${Utils.money(c.price)} / ${c.unit || (c.type === 'product' ? '件' : '次')}</div>
          </div>
          <div class="qty-stepper">
            <button data-act="dec">－</button>
            <input type="text" value="${c.qty}" data-act="set" inputmode="numeric" readonly>
            <button data-act="inc">＋</button>
          </div>
          <div class="ci-total">${Utils.money(c.price * c.qty)}</div>
          <button class="icon-btn" data-act="remove" title="移除">✕</button>
        </div>
      `).join('');
      // 平板優化：數量改用虛擬數字鍵盤輸入。
      list.querySelectorAll('[data-act="set"]').forEach((inp) => {
        const idx = Number(inp.closest('.cart-row').dataset.idx);
        const row = cart[idx];
        Utils.bindNumpadInput(inp, { title: '輸入數量', allowDecimal: false, min: 1, max: row && row.maxStock !== null ? row.maxStock : null });
      });
    }

    if (sumBox) {
      const policy = DB.state.meta.discountPolicy;
      const overLimit = policy && discountPercent() > policy.maxDiscountPercent;
      const blocked = discountNeedsApproval();
      const campaigns = activeCampaigns();
      const member = boundMember();
      const maxPts = maxRedeemablePoints();
      const loyaltyPolicy = DB.state.meta.loyaltyPolicy;
      sumBox.innerHTML = `
        <div class="sum-row"><span>小計</span><span>${Utils.money(subtotal())}</span></div>
        ${campaigns.length ? `
          <div class="field" style="margin:4px 0;">
            <label class="small">套用優惠活動</label>
            <select id="campaign-select">
              <option value="">不使用</option>
              ${campaigns.map((c) => `<option value="${c.id}" ${appliedCampaignId === c.id ? 'selected' : ''}>${Utils.escapeHtml(c.name)}（${c.type === 'percent' ? c.value + '%' : Utils.money(c.value)}）</option>`).join('')}
            </select>
          </div>
        ` : ''}
        <div class="sum-row"><span>折扣${overLimit ? `（${discountPercent().toFixed(0)}%）` : ''}</span>
          <span><input type="text" id="discount-input" value="${discount || ''}" placeholder="0" style="width:80px;text-align:right;padding:3px 6px;"></span>
        </div>
        ${overLimit ? `
          <div class="field" style="margin:4px 0;">
            <label class="small" style="color:var(--warn);">折扣超過 ${policy.maxDiscountPercent}% 上限，請填寫原因${blocked ? '（需管理員操作者才能結帳）' : ''}</label>
            <input type="text" id="discount-reason" value="${Utils.escapeHtml(discountReason)}" placeholder="例如：熟客優惠、商品瑕疵補償">
          </div>
        ` : ''}
        ${loyaltyEnabled() && member && (member.points || 0) > 0 ? `
          <div class="field" style="margin:4px 0;">
            <label class="small">點數折抵（會員剩餘 ${member.points} 點，最多可折抵 ${maxPts} 點 = ${Utils.money(maxPts / loyaltyPolicy.redeemPointsPerDollar)}）</label>
            <input type="number" id="points-input" min="0" max="${maxPts}" value="${pointsToRedeem || ''}" placeholder="0">
          </div>
        ` : ''}
        <div class="sum-row total"><span>應收金額</span><span>${Utils.money(total())}</span></div>
      `;
      // 平板優化：折扣/點數折抵改用虛擬數字鍵盤輸入，避免另外接實體鍵盤或叫出系統小鍵盤。
      Utils.bindNumpadInput(document.getElementById('discount-input'), { title: '輸入折扣金額', allowDecimal: false, min: 0, max: subtotal() });
      const pointsInput = document.getElementById('points-input');
      if (pointsInput) Utils.bindNumpadInput(pointsInput, { title: '輸入折抵點數', allowDecimal: false, min: 0, max: maxPts });
    }
  }

  function bindCartEvents() {
    const list = document.getElementById('pos-cart-list');
    list.addEventListener('click', (e) => {
      const row = e.target.closest('.cart-row');
      if (!row) return;
      const idx = Number(row.dataset.idx);
      const act = e.target.dataset.act;
      if (act === 'inc') changeQty(idx, 1);
      else if (act === 'dec') changeQty(idx, -1);
      else if (act === 'remove') removeRow(idx);
    });
    list.addEventListener('change', (e) => {
      if (e.target.dataset.act === 'set') {
        const row = e.target.closest('.cart-row');
        setQty(Number(row.dataset.idx), e.target.value);
      }
    });

    document.getElementById('pos-summary').addEventListener('change', (e) => {
      if (e.target.id === 'discount-input') {
        let v = parseFloat(e.target.value) || 0;
        if (v < 0) v = 0;
        if (v > subtotal()) v = subtotal();
        discount = v;
        appliedCampaignId = null; // 手動改折扣金額後，視為不再套用該優惠活動，避免灌水使用次數
        renderCart();
      } else if (e.target.id === 'discount-reason') {
        discountReason = e.target.value;
      } else if (e.target.id === 'campaign-select') {
        const campId = e.target.value;
        if (!campId) {
          appliedCampaignId = null;
          discount = 0;
          discountReason = '';
        } else {
          const camp = DB.state.discountCampaigns.find((c) => c.id === campId);
          if (camp) {
            const st = subtotal();
            const computed = camp.type === 'percent' ? st * camp.value / 100 : camp.value;
            appliedCampaignId = camp.id;
            discount = Math.min(st, Math.round(computed * 100) / 100);
            discountReason = camp.name;
          }
        }
        renderCart();
      } else if (e.target.id === 'points-input') {
        let v = Math.floor(Number(e.target.value)) || 0;
        if (v < 0) v = 0;
        const maxPts = maxRedeemablePoints();
        if (v > maxPts) v = maxPts;
        pointsToRedeem = v;
        renderCart();
      }
    });

    document.getElementById('pos-catalog-grid').addEventListener('click', (e) => {
      const btn = e.target.closest('.pos-product-card');
      if (!btn || btn.disabled) return;
      addToCart(btn.dataset.type, btn.dataset.id);
    });

    document.getElementById('pos-search').addEventListener('input', Utils.debounce((e) => {
      search = e.target.value;
      renderCatalogGrid();
    }, 180));

    document.getElementById('pos-cats').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      category = btn.dataset.cat;
      document.querySelectorAll('#pos-cats .tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.cat === category));
      renderCatalogGrid();
    });

    document.getElementById('btn-clear-cart').addEventListener('click', () => {
      if (!cart.length) return;
      Utils.confirmModal('確定要清空購物車嗎？', () => clearCart());
    });

    document.getElementById('btn-checkout').addEventListener('click', () => {
      if (!cart.length) { Utils.toast('購物車是空的', 'error'); return; }
      const reasonInput = document.getElementById('discount-reason');
      if (reasonInput) discountReason = reasonInput.value;
      const policy = DB.state.meta.discountPolicy;
      if (policy && discountPercent() > policy.maxDiscountPercent && !discountReason.trim()) {
        Utils.toast(`折扣超過 ${policy.maxDiscountPercent}% 上限，請先填寫折扣原因`, 'error');
        return;
      }
      if (discountNeedsApproval() && DB.getCurrentUser().role !== 'admin') {
        Utils.toast('此折扣超過上限，需切換為管理員身份的操作者才能結帳', 'error');
        return;
      }
      openCheckoutModal();
    });

    document.getElementById('pos-link-banner').addEventListener('click', (e) => {
      if (e.target.id === 'btn-unlink') { reservationId = null; enrollmentId = null; renderCart(); }
    });

    document.getElementById('pos-member-banner').addEventListener('click', (e) => {
      if (e.target.id === 'btn-pick-member') openMemberPicker();
      else if (e.target.id === 'btn-unlink-member') { memberId = null; renderCart(); }
    });
  }

  function openMemberPicker() {
    let q = '';
    function matches() {
      const members = DB.state.members;
      if (!q.trim()) return members;
      const kw = q.trim().toLowerCase();
      return members.filter((m) => m.name.toLowerCase().includes(kw) || (m.phone || '').includes(kw) || (m.pets || []).some((p) => p.name.toLowerCase().includes(kw)));
    }
    function rowsHtml() {
      const arr = matches();
      return arr.length ? arr.map((m) => `
        <tr>
          <td>${Utils.escapeHtml(m.name)}</td>
          <td class="nowrap">${Utils.escapeHtml(m.phone || '')}</td>
          <td>${Utils.escapeHtml((m.pets || []).map((p) => p.name + (p.type ? `（${p.type}）` : '')).join('、'))}</td>
          <td class="text-right">${Utils.money(m.balance || 0)}</td>
          <td><button class="btn sm" data-pick="${m.id}">選擇</button></td>
        </tr>
      `).join('') : `<tr><td colspan="5"><div class="empty-state">查無符合的會員</div></td></tr>`;
    }
    // 僅重繪表格內容（不重建整個 modal），避免搜尋框每輸入一個字就因整個 modal 重繪而失去焦點。
    function bindRows() {
      document.querySelectorAll('[data-pick]').forEach((b) => {
        b.onclick = () => { memberId = b.dataset.pick; Utils.closeModal(); renderCart(); };
      });
    }
    function refreshRows() {
      document.getElementById('member-pick-tbody').innerHTML = rowsHtml();
      bindRows();
    }
    Utils.openModal(`
      <div class="modal-title">選擇會員 <button class="icon-btn" id="modal-close">✕</button></div>
      <div class="search-box" style="margin-bottom:10px;"><span>🔍</span><input type="text" id="member-pick-search" placeholder="姓名 / 電話 / 寵物名稱"></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>姓名</th><th>電話</th><th>寵物</th><th class="text-right">儲值金</th><th></th></tr></thead>
          <tbody id="member-pick-tbody">${rowsHtml()}</tbody>
        </table>
      </div>
      <div class="modal-foot"><button class="btn" id="modal-cancel">取消</button></div>
    `);
    document.getElementById('modal-close').onclick = Utils.closeModal;
    document.getElementById('modal-cancel').onclick = Utils.closeModal;
    document.getElementById('member-pick-search').addEventListener('input', Utils.debounce((e) => { q = e.target.value; refreshRows(); }, 150));
    bindRows();
  }

  const PAY_METHODS = ['現金', '儲值金', '信用卡', '行動支付', 'LINE Pay', '轉帳', '其他'];
  const CASH_QUICK_ADD = [100, 500, 1000];

  function openCheckoutModal() {
    const t = total();
    let payments = [];
    let selMethod = '現金';
    let payAmount = t;
    let otherLabel = '';

    function boundMember() {
      return memberId ? DB.state.members.find((m) => m.id === memberId) : null;
    }
    function balanceUsedSoFar() {
      return payments.filter((p) => p.method === '儲值金').reduce((s, p) => s + p.amount, 0);
    }
    function availableBalance() {
      const m = boundMember();
      return m ? Math.max(0, Math.round(((m.balance || 0) - balanceUsedSoFar()) * 100) / 100) : 0;
    }

    function paidSum() { return payments.reduce((s, p) => s + p.amount, 0); }
    function remain() { return Math.max(0, Math.round((t - paidSum()) * 100) / 100); }

    function extraFieldHtml() {
      if (selMethod === '現金') {
        const change = Math.max(0, payAmount - remain());
        return `
          <div class="btn-row" style="margin-bottom:8px;">
            <button class="btn sm" data-quick="exact">剛好 ${Utils.money(remain())}</button>
            ${CASH_QUICK_ADD.map((n) => `<button class="btn sm" data-quick="${n}">+${n}</button>`).join('')}
            <button class="btn sm" data-quick="clear">清空</button>
          </div>
          <div class="hint">找零：${Utils.money(change)}</div>
        `;
      }
      if (selMethod === '儲值金') {
        const m = boundMember();
        return `<div class="hint">使用會員「${Utils.escapeHtml(m ? m.name : '')}」儲值金支付，目前可用餘額：${Utils.money(availableBalance())}</div>`;
      }
      if (selMethod === '其他') {
        return `
          <div class="field" style="margin:0;">
            <label>付款方式名稱 *</label>
            <input type="text" id="other-label" value="${Utils.escapeHtml(otherLabel)}" placeholder="例如：禮券、賒帳">
          </div>
        `;
      }
      return `<div class="hint">此付款方式將以輸入金額全額入帳</div>`;
    }

    function html() {
      const r = remain();
      return `
        <div class="modal-title">結帳 <button class="icon-btn" id="modal-close">✕</button></div>
        <div class="sum-row total" style="margin-bottom:10px;"><span>應收金額</span><span>${Utils.money(t)}</span></div>
        <div class="field"><label>付款方式</label>
          <div class="pay-method-grid">
            ${PAY_METHODS.map((m) => {
              const disabled = m === '儲值金' && availableBalance() <= 0;
              return `<button data-m="${m}" class="${m === selMethod ? 'active' : ''}" ${disabled ? 'disabled title="請先綁定會員，且會員需有可用儲值金餘額"' : ''}>${m}</button>`;
            }).join('')}
          </div>
        </div>
        <div class="field">
          <label>本次付款金額</label>
          <input type="text" id="pay-amount" value="${payAmount}" inputmode="decimal">
        </div>
        <div id="extra-field" style="min-height:64px;">${extraFieldHtml()}</div>
        <div class="btn-row" style="margin:8px 0 4px;">
          <button class="btn sm primary" id="btn-add-payment">＋ 加入此付款（支援混合付款）</button>
        </div>
        <div id="payment-lines">
          ${payments.map((p, i) => `<div class="sum-row"><span>${Utils.escapeHtml(p.method)}</span><span>${Utils.money(p.amount)} <button class="icon-btn" data-rm="${i}" style="width:22px;height:22px;">✕</button></span></div>`).join('')}
        </div>
        <div class="divider"></div>
        <div class="sum-row"><span>已收</span><span>${Utils.money(paidSum())}</span></div>
        <div class="sum-row" style="font-weight:700"><span>尚需收款</span><span>${Utils.money(r)}</span></div>
        <div class="modal-foot">
          <button class="btn" id="modal-cancel">取消</button>
          <button class="btn primary" id="btn-confirm-pay" ${r > 0 ? 'disabled' : ''}>確認收款並完成結帳</button>
        </div>
      `;
    }

    function rerender() {
      Utils.openModal(html());
      bind();
    }

    function refreshExtraField() {
      document.getElementById('extra-field').innerHTML = extraFieldHtml();
      bindExtraField();
    }

    function bindExtraField() {
      document.querySelectorAll('[data-quick]').forEach((b) => {
        b.onclick = () => {
          if (b.dataset.quick === 'exact') payAmount = remain();
          else if (b.dataset.quick === 'clear') payAmount = 0;
          else payAmount = Math.round((payAmount + Number(b.dataset.quick)) * 100) / 100;
          document.getElementById('pay-amount').value = payAmount;
          refreshExtraField();
        };
      });
      const otherInput = document.getElementById('other-label');
      if (otherInput) otherInput.oninput = (e) => { otherLabel = e.target.value; };
    }

    function bind() {
      document.getElementById('modal-close').onclick = Utils.closeModal;
      document.getElementById('modal-cancel').onclick = Utils.closeModal;
      document.querySelectorAll('.pay-method-grid button').forEach((b) => {
        b.onclick = () => {
          selMethod = b.dataset.m;
          payAmount = selMethod === '儲值金' ? Math.min(remain(), availableBalance()) : remain();
          rerender();
        };
      });
      document.getElementById('pay-amount').oninput = (e) => {
        payAmount = parseFloat(e.target.value) || 0;
        if (selMethod === '現金') refreshExtraField();
      };
      // 平板優化：付款金額改用虛擬數字鍵盤輸入。
      Utils.bindNumpadInput(document.getElementById('pay-amount'), { title: '輸入付款金額', allowDecimal: true, min: 0 });
      bindExtraField();
      document.getElementById('btn-add-payment').onclick = () => {
        const r = remain();
        if (r <= 0) { Utils.toast('款項已收足', 'error'); return; }
        if (payAmount <= 0) { Utils.toast('請輸入付款金額', 'error'); return; }
        let method = selMethod;
        if (selMethod === '其他') {
          if (!otherLabel.trim()) { Utils.toast('請輸入付款方式名稱', 'error'); return; }
          method = otherLabel.trim();
        }
        if (selMethod === '儲值金') {
          const avail = availableBalance();
          if (avail <= 0) { Utils.toast('此會員目前無可用儲值金', 'error'); return; }
          if (payAmount > avail) { Utils.toast(`儲值金可用餘額不足（可用 ${Utils.money(avail)}）`, 'error'); return; }
        }
        const amt = Math.min(payAmount, r);
        payments.push({ method, amount: Math.round(amt * 100) / 100 });
        payAmount = remain();
        otherLabel = '';
        rerender();
      };
      document.querySelectorAll('[data-rm]').forEach((b) => {
        b.onclick = () => { payments.splice(Number(b.dataset.rm), 1); payAmount = remain(); rerender(); };
      });
      document.getElementById('btn-confirm-pay').onclick = (e) => {
        if (isSubmitting) return; // 第一層防護：提交中直接忽略後續點擊
        if (paidSum() < t) { Utils.toast('收款金額不足', 'error'); return; }
        e.currentTarget.disabled = true; // 立即鎖定按鈕，避免瀏覽器/觸控裝置的重複點擊事件再次觸發
        completeSale(payments, t);
      };
    }

    rerender();
  }

  function completeSale(payments, t) {
    // 第二層防護：即使按鈕鎖定被繞過（例如程式重複呼叫、事件重入），這裡再次確認狀態才允許建立訂單。
    if (isSubmitting) return;
    if (!cart.length) { Utils.toast('購物車是空的，無法完成結帳', 'error'); return; }
    if (!payments || !payments.length) { Utils.toast('尚未輸入付款方式', 'error'); return; }
    // BUG-009 第二層防護：折扣政策在此再次確認，避免結帳視窗開啟後政策/操作者被繞過。
    if (discountNeedsApproval() && DB.getCurrentUser().role !== 'admin') {
      Utils.toast('此折扣超過上限，需管理員身份操作者才能完成結帳', 'error');
      return;
    }
    // 儲值金付款第二層防護：再次確認會員仍存在且餘額足夠，避免結帳視窗開啟期間餘額被其他操作變動。
    const balancePayTotal = payments.filter((p) => p.method === '儲值金').reduce((s, p) => s + p.amount, 0);
    const balanceMember = memberId ? DB.state.members.find((m) => m.id === memberId) : null;
    if (balancePayTotal > 0) {
      if (!balanceMember) { Utils.toast('儲值金付款異常：找不到綁定的會員', 'error'); return; }
      if (balancePayTotal > (balanceMember.balance || 0)) { Utils.toast('儲值金付款金額超過會員目前可用餘額，請重新確認', 'error'); return; }
    }
    // 點數折抵第二層防護：再次確認會員仍存在且點數足夠。
    const pointsMember = memberId ? DB.state.members.find((m) => m.id === memberId) : null;
    if (pointsToRedeem > 0) {
      if (!pointsMember) { Utils.toast('點數折抵異常：找不到綁定的會員', 'error'); return; }
      if (pointsToRedeem > (pointsMember.points || 0)) { Utils.toast('點數折抵數量超過會員目前持有點數，請重新確認', 'error'); return; }
    }

    isSubmitting = true;
    try {
      const s = DB.state;
      const order = {
        id: DB.uid('SO'),
        no: DB.nextDocNo('S', s.posOrders),
        datetime: new Date().toISOString(),
        items: cart.map((c) => ({ type: c.type, refId: c.refId, name: c.name, price: c.price, qty: c.qty, cost: c.cost })),
        subtotal: subtotal(),
        discount,
        discountPercent: Math.round(discountPercent() * 10) / 10,
        discountReason: discountReason.trim() || null,
        discountApprovedBy: discountNeedsApproval() ? DB.getCurrentUser().name : null,
        total: t,
        payments,
        status: '完成',
        reservationId: reservationId || null,
        enrollmentId: enrollmentId || null,
        memberId: memberId || null,
        cashier: DB.getCurrentUser().name,
        pointsRedeemed: pointsToRedeem || 0,
        pointsEarned: 0, // 下方確定會員存在後才計算並回填，退款時需依此欄位扣回
        discountCampaignId: appliedCampaignId || null,
        discountCampaignName: appliedCampaignId ? (DB.state.discountCampaigns.find((c) => c.id === appliedCampaignId) || {}).name || null : null,
      };
      s.posOrders.push(order);

      order.items.forEach((it) => {
        if (it.type === 'product') {
          const p = s.products.find((pp) => pp.id === it.refId);
          if (p) {
            p.stock -= it.qty;
            s.inventoryLogs.push({ id: DB.uid('LOG'), date: DB.todayStr(), productId: p.id, type: '銷售', qty: -it.qty, note: order.no, stockAfter: p.stock, operator: order.cashier });
          }
        }
      });

      if (reservationId) {
        const order2 = s.reservations.find((g) => g.id === reservationId);
        if (order2) { order2.status = '已結帳'; order2.posOrderId = order.id; }
      }
      if (enrollmentId) {
        const enrollment = s.enrollments.find((e) => e.id === enrollmentId);
        if (enrollment) { enrollment.status = '已結帳'; enrollment.posOrderId = order.id; }
      }

      if (balancePayTotal > 0 && balanceMember) {
        balanceMember.balance = Math.round(((balanceMember.balance || 0) - balancePayTotal) * 100) / 100;
        s.memberBalanceLogs.push({
          id: DB.uid('MBL'), memberId: balanceMember.id, type: '消費扣款', amount: -balancePayTotal,
          balanceAfter: balanceMember.balance, note: order.no, operator: order.cashier, datetime: new Date().toISOString(),
        });
      }

      if (pointsMember) {
        if (pointsToRedeem > 0) {
          pointsMember.points = Math.max(0, (pointsMember.points || 0) - pointsToRedeem);
          s.memberPointLogs.push({
            id: DB.uid('MPL'), memberId: pointsMember.id, type: '兌換折抵', points: -pointsToRedeem,
            pointsAfter: pointsMember.points, note: order.no, operator: order.cashier, datetime: new Date().toISOString(),
          });
        }
        // 集點：依會員集點政策，以本筆訂單實際應收金額（已扣除所有折扣/點數折抵後）計算，
        // 避免用點數折抵的部分又拿去換更多點數。
        if (loyaltyEnabled()) {
          const pointsEarned = Math.floor(order.total / DB.state.meta.loyaltyPolicy.earnAmountPerPoint);
          if (pointsEarned > 0) {
            order.pointsEarned = pointsEarned;
            pointsMember.points = (pointsMember.points || 0) + pointsEarned;
            s.memberPointLogs.push({
              id: DB.uid('MPL'), memberId: pointsMember.id, type: '消費集點', points: pointsEarned,
              pointsAfter: pointsMember.points, note: order.no, operator: order.cashier, datetime: new Date().toISOString(),
            });
          }
        }
      }

      if (appliedCampaignId) {
        const camp = s.discountCampaigns.find((c) => c.id === appliedCampaignId);
        if (camp) camp.usedCount = (camp.usedCount || 0) + 1;
      }

      DB.save();
      Utils.closeModal();
      clearCart(true);
      Utils.toast('結帳完成！訂單編號 ' + order.no, 'success');
      showReceipt(order);
      renderAll();
    } finally {
      isSubmitting = false;
    }
  }

  function showReceipt(order) {
    const s = DB.state;
    const lines = order.items.map((it) => `<div class="r-line"><span>${Utils.escapeHtml(it.name)} x${it.qty}</span><span>${Utils.money(it.price * it.qty)}</span></div>`).join('');
    const pay = order.payments.map((p) => `<div class="r-line"><span>${p.method}</span><span>${Utils.money(p.amount)}</span></div>`).join('');
    Utils.openModal(`
      <div class="modal-title">收據 <button class="icon-btn" id="modal-close">✕</button></div>
      <div class="receipt" id="receipt-content">
        <div style="text-align:center;font-weight:700;">${Utils.escapeHtml(s.meta.storeName)}</div>
        <div style="text-align:center;">${order.no}</div>
        <div style="text-align:center;">${Utils.fmtDateTime(order.datetime)}</div>
        <hr>
        ${lines}
        <hr>
        <div class="r-line"><span>小計</span><span>${Utils.money(order.subtotal)}</span></div>
        <div class="r-line"><span>折扣</span><span>-${Utils.money(order.discount)}</span></div>
        <div class="r-line" style="font-weight:700"><span>總計</span><span>${Utils.money(order.total)}</span></div>
        <hr>
        ${pay}
        <hr>
        <div style="text-align:center;">感謝您的光臨 🐾</div>
      </div>
      <div class="modal-foot">
        <button class="btn" id="btn-print">列印</button>
        <button class="btn primary" id="modal-done">完成</button>
      </div>
    `);
    document.getElementById('modal-close').onclick = Utils.closeModal;
    document.getElementById('modal-done').onclick = Utils.closeModal;
    document.getElementById('btn-print').onclick = () => {
      document.getElementById('print-area').innerHTML = document.getElementById('receipt-content').outerHTML;
      window.print();
    };
  }

  function renderShell() {
    root().innerHTML = `
      <div class="pos-layout">
        <div class="pos-left">
          <div class="toolbar">
            <div class="search-box" style="flex:1"><span>🔍</span><input type="text" id="pos-search" placeholder="搜尋商品名稱或掃描條碼..." value="${Utils.escapeHtml(search)}"></div>
          </div>
          <div class="tabs" id="pos-cats">
            ${categories().map((c) => `<button class="tab-btn ${c === category ? 'active' : ''}" data-cat="${c}">${c === 'all' ? '全部' : c}</button>`).join('')}
          </div>
          <div class="pos-catalog"><div class="pos-product-grid" id="pos-catalog-grid"></div></div>
        </div>
        <div class="pos-right">
          <div class="pos-cart-head">
            <span>🛒 目前結帳單</span>
            <button class="link-btn" id="btn-clear-cart">清空</button>
          </div>
          <div id="pos-member-banner" style="margin:8px 12px 0;"></div>
          <div class="badge orange" id="pos-link-banner" style="margin:8px 12px 0;padding:8px 10px;display:flex;justify-content:space-between;" hidden></div>
          <div class="pos-cart-list" id="pos-cart-list"></div>
          <div class="pos-summary" id="pos-summary"></div>
          <div class="pos-actions">
            <button class="btn primary" id="btn-checkout" style="font-size:15px;padding:13px;">前往結帳</button>
          </div>
        </div>
      </div>
    `;
    bindCartEvents();
    renderCatalogGrid();
    renderCart();
  }

  function renderAll() { renderShell(); }
  function render() { renderShell(); }

  return { render, loadReservation, loadEnrollment };
})();
