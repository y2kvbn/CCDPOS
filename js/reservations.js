/* ========================================================================
 * reservations.js - 訂單管理（美容 / 寄養(住宿) / 安親(臨時寄養)）
 * ======================================================================== */
const Reservations = (() => {
  let tab = 'orders';
  let categoryFilter = 'all';
  let statusFilter = 'all';
  let ordersPage = 1;
  const ORDERS_PER_PAGE = 50;

  const CATEGORIES = ['美容', '寄養', '安親'];
  const CATEGORY_BADGE = { 美容: 'orange', 寄養: 'teal', 安親: 'yellow' };

  function root() { return document.getElementById('view-reservations'); }

  function serviceNames(ids) {
    return ids.map((id) => {
      const s = DB.state.services.find((sv) => sv.id === id);
      return s ? s.name : '(已刪除)';
    }).join('、');
  }

  function multiplier(order) {
    if (order.category === '寄養') return Math.max(1, DB.nightsBetween(order.dateFrom, order.dateTo));
    if (order.category === '安親') return Math.max(1, Number(order.qty) || 1);
    return 1;
  }

  function orderTotal(order) {
    const base = order.serviceIds.reduce((sum, id) => {
      const s = DB.state.services.find((sv) => sv.id === id);
      return sum + (s ? s.price : 0);
    }, 0);
    return base * multiplier(order);
  }

  function dateLabel(order) {
    if (order.category === '寄養') {
      const n = DB.nightsBetween(order.dateFrom, order.dateTo);
      return `${order.dateFrom || '?'} → ${order.dateTo || '?'}（${n} 晚）`;
    }
    if (order.category === '安親') return `${order.date || '?'} × ${order.qty || 1}`;
    return order.date || '';
  }

  function statusBadge(st) {
    const map = { 待結帳: 'orange', 已結帳: 'green', 已取消: 'red' };
    return `<span class="badge ${map[st] || 'gray'}">${st}</span>`;
  }

  function renderOrdersTab() {
    const s = DB.state;
    let list = [...s.reservations].sort((a, b) => b.no.localeCompare(a.no));
    if (categoryFilter !== 'all') list = list.filter((o) => o.category === categoryFilter);
    if (statusFilter !== 'all') list = list.filter((o) => o.status === statusFilter);
    // BUG-007：分頁。
    const { pageItems, totalPages, page: clampedPage } = Utils.paginate(list, ordersPage, ORDERS_PER_PAGE);
    ordersPage = clampedPage;

    return `
      <div class="toolbar">
        <div class="tabs" style="border:none;margin:0;">
          ${['all', ...CATEGORIES].map((c) => `<button class="tab-btn ${categoryFilter === c ? 'active' : ''}" data-cat="${c}">${c === 'all' ? '全部類別' : c}</button>`).join('')}
        </div>
        <div class="tabs" style="border:none;margin:0;">
          ${['all', '待結帳', '已結帳', '已取消'].map((st) => `<button class="tab-btn ${statusFilter === st ? 'active' : ''}" data-status="${st}">${st === 'all' ? '全部狀態' : st}</button>`).join('')}
        </div>
        <div class="spacer"></div>
        <button class="btn primary" id="btn-new-res">＋ 新增訂單</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>單號</th><th>類別</th><th>寵物</th><th>飼主</th><th>電話</th><th>項目</th><th>負責人員</th><th>日期</th><th class="text-right">金額</th><th>狀態</th><th></th></tr></thead>
            <tbody>
              ${pageItems.length ? pageItems.map((o) => `
                <tr>
                  <td class="nowrap">${o.no}</td>
                  <td><span class="badge ${CATEGORY_BADGE[o.category] || 'gray'}">${o.category}</span></td>
                  <td>${Utils.escapeHtml(o.petName)}</td>
                  <td>${Utils.escapeHtml(o.ownerName)}</td>
                  <td>${Utils.escapeHtml(o.phone || '')}</td>
                  <td>${Utils.escapeHtml(serviceNames(o.serviceIds))}</td>
                  <td>${Utils.escapeHtml(o.staffName || '')}</td>
                  <td class="nowrap">${dateLabel(o)}</td>
                  <td class="text-right">${Utils.money(orderTotal(o))}</td>
                  <td>${statusBadge(o.status)}</td>
                  <td class="nowrap">
                    ${o.status === '待結帳' ? `<button class="btn sm primary" data-checkout="${o.id}">轉POS結帳</button>` : ''}
                    <button class="btn sm" data-edit="${o.id}">編輯</button>
                    ${o.status !== '已結帳' ? `<button class="btn sm danger" data-del="${o.id}">刪除</button>` : ''}
                  </td>
                </tr>
              `).join('') : `<tr><td colspan="11"><div class="empty-state">目前沒有訂單</div></td></tr>`}
            </tbody>
          </table>
        </div>
        ${Utils.paginationHtml(ordersPage, totalPages)}
      </div>
    `;
  }

  function renderServicesTab() {
    const list = [...DB.state.services];
    return `
      <div class="toolbar">
        <div class="spacer"></div>
        <button class="btn primary" id="btn-new-service">＋ 新增服務項目</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>服務名稱</th><th>訂單類別</th><th>子分類</th><th class="text-right">售價</th><th class="text-right">成本</th><th>計價單位</th><th>狀態</th><th></th></tr></thead>
            <tbody>
              ${list.length ? list.map((sv) => `
                <tr>
                  <td>${Utils.escapeHtml(sv.name)}</td>
                  <td><span class="badge ${CATEGORY_BADGE[sv.type] || 'gray'}">${sv.type}</span></td>
                  <td class="muted">${Utils.escapeHtml(sv.category || '')}</td>
                  <td class="text-right">${Utils.money(sv.price)}</td>
                  <td class="text-right muted">${Utils.money(sv.cost)}</td>
                  <td>/ ${sv.priceUnit}</td>
                  <td>${sv.enabled ? '<span class="badge green">啟用</span>' : '<span class="badge gray">停用</span>'}</td>
                  <td class="nowrap"><button class="btn sm" data-edit-sv="${sv.id}">編輯</button><button class="btn sm danger" data-del-sv="${sv.id}">刪除</button></td>
                </tr>
              `).join('') : `<tr><td colspan="8"><div class="empty-state">尚無服務項目</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function serviceCheckList(category, selectedIds) {
    const list = DB.state.services.filter((sv) => sv.type === category && sv.enabled);
    if (!list.length) return `<div class="hint">此類別尚無服務項目，請先至「服務項目設定」新增</div>`;
    return list.map((sv) => `
      <label class="checkbox-row" style="background:#faf7f1;padding:6px 10px;border-radius:8px;border:1px solid var(--line);">
        <input type="checkbox" value="${sv.id}" class="f-service" ${selectedIds.includes(sv.id) ? 'checked' : ''}>
        ${Utils.escapeHtml(sv.name)} (${Utils.money(sv.price)}/${sv.priceUnit})
      </label>
    `).join('');
  }

  function categoryFieldsHtml(order) {
    if (order.category === '寄養') {
      return `
        <div class="field"><label>入住日期 *</label><input type="date" id="f-datefrom" value="${order.dateFrom || DB.todayStr()}"></div>
        <div class="field"><label>退宿日期 *</label><input type="date" id="f-dateto" value="${order.dateTo || DB.todayStr()}"></div>
        <div class="field full"><label>房型 / 寄養項目 *</label><div style="display:flex;flex-wrap:wrap;gap:8px;" id="f-service-list">${serviceCheckList('寄養', order.serviceIds)}</div></div>
        <div class="field full hint" id="nights-hint"></div>
      `;
    }
    if (order.category === '安親') {
      return `
        <div class="field"><label>日期 *</label><input type="date" id="f-date" value="${order.date || DB.todayStr()}"></div>
        <div class="field"><label>數量 / 人次</label><input type="number" id="f-qty" value="${order.qty || 1}" min="1"></div>
        <div class="field full"><label>臨托項目 *</label><div style="display:flex;flex-wrap:wrap;gap:8px;" id="f-service-list">${serviceCheckList('安親', order.serviceIds)}</div></div>
      `;
    }
    return `
      <div class="field"><label>服務日期 *</label><input type="date" id="f-date" value="${order.date || DB.todayStr()}"></div>
      <div class="field"><label>負責美容師</label><input type="text" id="f-staff" value="${Utils.escapeHtml(order.staffName || '')}"></div>
      <div class="field full"><label>美容項目 *</label><div style="display:flex;flex-wrap:wrap;gap:8px;" id="f-service-list">${serviceCheckList('美容', order.serviceIds)}</div></div>
    `;
  }

  function openOrderForm(order) {
    const isEdit = !!order;
    order = order || { category: '美容', petName: '', ownerName: '', phone: '', serviceIds: [], staffName: '', date: DB.todayStr(), dateFrom: '', dateTo: '', qty: 1, status: '待結帳', note: '' };

    function bodyHtml() {
      return `
        <div class="modal-title">${isEdit ? '編輯' : '新增'}訂單 <button class="icon-btn" id="modal-close">✕</button></div>
        <div class="field"><label>訂單類別 *</label>
          <div class="pay-method-grid" id="f-category-grid">
            ${CATEGORIES.map((c) => `<button type="button" data-c="${c}" class="${order.category === c ? 'active' : ''}">${c === '美容' ? '美容' : c === '寄養' ? '寄養（住宿）' : '安親（臨托）'}</button>`).join('')}
          </div>
        </div>
        <div class="form-grid">
          <div class="field"><label>寵物名稱 *</label><input type="text" id="f-pet" value="${Utils.escapeHtml(order.petName)}"></div>
          <div class="field"><label>飼主姓名 *</label><input type="text" id="f-owner" value="${Utils.escapeHtml(order.ownerName)}"></div>
          <div class="field"><label>聯絡電話</label><input type="text" id="f-phone" value="${Utils.escapeHtml(order.phone)}"></div>
          ${order.category !== '美容' ? `<div class="field"><label>負責人員</label><input type="text" id="f-staff" value="${Utils.escapeHtml(order.staffName || '')}"></div>` : ''}
          <div class="field"><label>狀態</label>
            <select id="f-order-status">${['待結帳', '已結帳', '已取消'].map((st) => `<option value="${st}" ${order.status === st ? 'selected' : ''}>${st}</option>`).join('')}</select>
          </div>
          <div id="category-fields" class="full form-grid" style="grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;">${categoryFieldsHtml(order)}</div>
          <div class="field full"><label>備註</label><textarea id="f-note">${Utils.escapeHtml(order.note || '')}</textarea></div>
        </div>
        <div class="modal-foot">
          <button class="btn" id="modal-cancel">取消</button>
          <button class="btn primary" id="btn-save-order">儲存</button>
        </div>
      `;
    }

    function rerender() { Utils.openModal(bodyHtml(), { wide: true }); bind(); }

    function updateNightsHint() {
      const el = document.getElementById('nights-hint');
      if (!el) return;
      const from = document.getElementById('f-datefrom').value;
      const to = document.getElementById('f-dateto').value;
      const n = DB.nightsBetween(from, to);
      el.textContent = n > 0 ? `共 ${n} 晚` : '退宿日期需晚於入住日期';
    }

    function captureCommonFields() {
      const g = (id) => { const el = document.getElementById(id); return el ? el.value : undefined; };
      if (g('f-pet') !== undefined) order.petName = g('f-pet');
      if (g('f-owner') !== undefined) order.ownerName = g('f-owner');
      if (g('f-phone') !== undefined) order.phone = g('f-phone');
      if (g('f-note') !== undefined) order.note = g('f-note');
      if (g('f-order-status') !== undefined) order.status = g('f-order-status');
    }

    function bind() {
      document.getElementById('modal-close').onclick = Utils.closeModal;
      document.getElementById('modal-cancel').onclick = Utils.closeModal;
      document.querySelectorAll('#f-category-grid button').forEach((b) => {
        b.onclick = () => {
          captureCommonFields();
          order.category = b.dataset.c;
          order.serviceIds = [];
          rerender();
        };
      });
      const dateFrom = document.getElementById('f-datefrom');
      if (dateFrom) {
        dateFrom.onchange = updateNightsHint;
        document.getElementById('f-dateto').onchange = updateNightsHint;
        updateNightsHint();
      }
      let orderSaved = false;
      document.getElementById('btn-save-order').onclick = (e) => {
        if (orderSaved) return; // 第二層防護：避免重複點擊建立兩筆訂單
        const petName = document.getElementById('f-pet').value.trim();
        const ownerName = document.getElementById('f-owner').value.trim();
        const serviceIds = Array.from(document.querySelectorAll('.f-service:checked')).map((el) => el.value);
        if (!petName || !ownerName) { Utils.toast('請填寫寵物名稱與飼主姓名', 'error'); return; }
        if (!serviceIds.length) { Utils.toast('請至少選擇一項服務/項目', 'error'); return; }
        const data = {
          category: order.category, petName, ownerName,
          phone: document.getElementById('f-phone').value.trim(),
          status: document.getElementById('f-order-status').value,
          note: document.getElementById('f-note').value.trim(),
          serviceIds,
          staffName: order.category === '美容' ? document.getElementById('f-staff').value.trim() : (document.getElementById('f-staff') ? document.getElementById('f-staff').value.trim() : ''),
          date: '', dateFrom: '', dateTo: '', qty: 1,
        };
        if (order.category === '寄養') {
          data.dateFrom = document.getElementById('f-datefrom').value;
          data.dateTo = document.getElementById('f-dateto').value;
          if (!data.dateFrom || !data.dateTo || DB.nightsBetween(data.dateFrom, data.dateTo) <= 0) { Utils.toast('請確認入住／退宿日期正確', 'error'); return; }
        } else if (order.category === '安親') {
          data.date = document.getElementById('f-date').value || DB.todayStr();
          // BUG-004：不可再用 `Number(...) || 1` 靜默把 0 或無效輸入改成 1，必須明確擋下並告知使用者。
          const qtyRaw = document.getElementById('f-qty').value;
          const qtyNum = Number(qtyRaw);
          if (qtyRaw === '' || isNaN(qtyNum) || qtyNum <= 0) {
            Utils.toast('請輸入正確的數量／人次（需大於 0）', 'error');
            return;
          }
          data.qty = qtyNum;
        } else {
          data.date = document.getElementById('f-date').value || DB.todayStr();
        }
        orderSaved = true;
        e.currentTarget.disabled = true; // 第一層防護：立即鎖定按鈕
        if (isEdit) {
          Object.assign(order, data);
        } else {
          DB.state.reservations.push({ id: DB.uid('RES'), no: DB.nextDocNo('RES', DB.state.reservations), posOrderId: null, ...data });
        }
        DB.save();
        Utils.closeModal();
        Utils.toast('已儲存', 'success');
        render();
      };
    }

    rerender();
  }

  function openServiceForm(sv) {
    const isEdit = !!sv;
    sv = sv || { name: '', type: '美容', category: '', price: 0, cost: 0, duration: 30, priceUnit: '次', enabled: true };
    Utils.openModal(`
      <div class="modal-title">${isEdit ? '編輯' : '新增'}服務項目 <button class="icon-btn" id="modal-close">✕</button></div>
      <div class="field"><label>服務名稱 *</label><input type="text" id="f-name" value="${Utils.escapeHtml(sv.name)}"></div>
      <div class="form-grid">
        <div class="field"><label>訂單類別 *</label>
          <select id="f-type">${CATEGORIES.map((c) => `<option value="${c}" ${sv.type === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
        </div>
        <div class="field"><label>子分類</label><input type="text" id="f-service-subcat" value="${Utils.escapeHtml(sv.category)}" placeholder="洗澡 / 造型 / 住宿 / 臨托"></div>
        <div class="field"><label>售價 *</label><input type="number" id="f-price" value="${sv.price}"></div>
        <div class="field"><label>成本</label><input type="number" id="f-cost" value="${sv.cost}"></div>
        <div class="field"><label>計價單位</label>
          <select id="f-unit">
            <option value="次" ${sv.priceUnit === '次' ? 'selected' : ''}>次</option>
            <option value="晚" ${sv.priceUnit === '晚' ? 'selected' : ''}>晚</option>
          </select>
        </div>
        <div class="field"><label>預估時間（分鐘）</label><input type="number" id="f-dur" value="${sv.duration}"></div>
      </div>
      <label class="checkbox-row"><input type="checkbox" id="f-enabled" ${sv.enabled ? 'checked' : ''}> 啟用（可於訂單/POS 使用）</label>
      <div class="modal-foot">
        <button class="btn" id="modal-cancel">取消</button>
        <button class="btn primary" id="btn-save-sv">儲存</button>
      </div>
    `);
    document.getElementById('modal-close').onclick = Utils.closeModal;
    document.getElementById('modal-cancel').onclick = Utils.closeModal;
    let serviceSaved = false;
    document.getElementById('btn-save-sv').onclick = (e) => {
      if (serviceSaved) return;
      const name = document.getElementById('f-name').value.trim();
      if (!name) { Utils.toast('請輸入服務名稱', 'error'); return; }
      const data = {
        name,
        type: document.getElementById('f-type').value,
        category: document.getElementById('f-service-subcat').value.trim() || '一般',
        duration: Number(document.getElementById('f-dur').value) || 0,
        price: Number(document.getElementById('f-price').value) || 0,
        cost: Number(document.getElementById('f-cost').value) || 0,
        priceUnit: document.getElementById('f-unit').value,
        enabled: document.getElementById('f-enabled').checked,
      };
      serviceSaved = true;
      e.currentTarget.disabled = true;
      if (isEdit) Object.assign(sv, data);
      else DB.state.services.push({ id: DB.uid('S'), ...data });
      DB.save();
      Utils.closeModal();
      Utils.toast('已儲存', 'success');
      render();
    };
  }

  function bind() {
    root().querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; ordersPage = 1; render(); }));

    if (tab === 'orders') {
      root().querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { categoryFilter = b.dataset.cat; ordersPage = 1; render(); }));
      root().querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => { statusFilter = b.dataset.status; ordersPage = 1; render(); }));
      const pager = root().querySelector('.pagination');
      if (pager) pager.addEventListener('click', (e) => {
        if (e.target.dataset.pg === 'prev') { ordersPage -= 1; render(); }
        else if (e.target.dataset.pg === 'next') { ordersPage += 1; render(); }
      });
      const newBtn = document.getElementById('btn-new-res');
      if (newBtn) newBtn.addEventListener('click', () => openOrderForm(null));
      root().querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
        openOrderForm(DB.state.reservations.find((o) => o.id === b.dataset.edit));
      }));
      root().querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
        Utils.confirmModal('確定要刪除此訂單嗎？', () => {
          DB.state.reservations = DB.state.reservations.filter((o) => o.id !== b.dataset.del);
          DB.save(); render(); Utils.toast('已刪除', 'success');
        });
      }));
      root().querySelectorAll('[data-checkout]').forEach((b) => b.addEventListener('click', () => {
        POS.loadReservation(b.dataset.checkout);
      }));
    } else {
      const newBtn = document.getElementById('btn-new-service');
      if (newBtn) newBtn.addEventListener('click', () => openServiceForm(null));
      root().querySelectorAll('[data-edit-sv]').forEach((b) => b.addEventListener('click', () => {
        openServiceForm(DB.state.services.find((s) => s.id === b.dataset.editSv));
      }));
      root().querySelectorAll('[data-del-sv]').forEach((b) => b.addEventListener('click', () => {
        Utils.confirmModal('確定要刪除此服務項目嗎？', () => {
          DB.state.services = DB.state.services.filter((s) => s.id !== b.dataset.delSv);
          DB.save(); render(); Utils.toast('已刪除', 'success');
        });
      }));
    }
  }

  function render() {
    root().innerHTML = `
      <div class="tabs">
        <button class="tab-btn ${tab === 'orders' ? 'active' : ''}" data-tab="orders">訂單列表</button>
        <button class="tab-btn ${tab === 'services' ? 'active' : ''}" data-tab="services">服務項目設定</button>
      </div>
      ${tab === 'orders' ? renderOrdersTab() : renderServicesTab()}
    `;
    bind();
  }

  return { render, orderTotal, multiplier };
})();
