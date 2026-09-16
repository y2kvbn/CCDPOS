/* ========================================================================
 * purchasing.js - 進貨管理（供應商 / 進貨單 / 入庫 / 進貨紀錄）
 * ======================================================================== */
const Purchasing = (() => {
  let tab = 'purchases';
  let purchasesPage = 1;
  const PURCHASES_PER_PAGE = 50;

  function root() { return document.getElementById('view-purchasing'); }

  function supplierName(id) {
    const s = DB.state.suppliers.find((x) => x.id === id);
    return s ? s.name : '(未指定)';
  }
  function productName(id) {
    const p = DB.state.products.find((x) => x.id === id);
    return p ? p.name : '(已刪除商品)';
  }
  function poTotal(po) {
    return po.items.reduce((s, it) => s + it.qty * it.cost, 0);
  }

  /**
   * AI 查價：用 Gemini 解析出的 {brand, productName, specification, keywords} 去比對
   * 系統既有商品（DB.state.products）。本系統目前沒有獨立的 SKU 欄位，最接近的唯一識別
   * 欄位是 barcode，因此若使用者輸入恰好等於某商品的 barcode，直接視為精確比對命中；
   * 否則以品牌/名稱/規格/關鍵字做簡單加權比對，回傳分數最高且 > 0 的商品。
   */
  function findMatchingProduct(parsed, rawQuery) {
    const products = DB.state.products;
    const exactBarcode = products.find((p) => p.barcode && p.barcode === rawQuery.trim());
    if (exactBarcode) return exactBarcode;

    const kw = [parsed.brand, parsed.productName, parsed.specification, ...(parsed.keywords || [])]
      .filter(Boolean).map((x) => x.toLowerCase());

    let best = null;
    let bestScore = 0;
    products.forEach((p) => {
      const hay = `${p.name} ${p.brand || ''} ${p.spec || ''}`.toLowerCase();
      let score = 0;
      kw.forEach((k) => { if (k && hay.includes(k)) score += 1; });
      if (parsed.brand && p.brand && p.brand.toLowerCase().includes(parsed.brand.toLowerCase())) score += 2;
      if (parsed.productName && p.name.toLowerCase().includes(parsed.productName.toLowerCase())) score += 2;
      if (parsed.specification && (p.spec || '').toLowerCase().includes(parsed.specification.toLowerCase())) score += 1;
      if (score > bestScore) { bestScore = score; best = p; }
    });
    return bestScore > 0 ? best : null;
  }

  /** 彙總某商品所有歷史進貨單品項，計算最近一次/最低/最高/平均成本與進貨次數。無歷史紀錄回傳 null。 */
  function historicalStatsFor(productId) {
    const records = [];
    DB.state.purchases.forEach((po) => {
      po.items.forEach((it) => {
        if (it.productId === productId) records.push({ cost: it.cost, sortKey: `${po.date || ''}T${po.createdAt || ''}` });
      });
    });
    if (!records.length) return null;
    records.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    const costs = records.map((r) => r.cost);
    return {
      recent: records[records.length - 1].cost,
      min: Math.min(...costs),
      max: Math.max(...costs),
      avg: Math.round((costs.reduce((sum, c) => sum + c, 0) / costs.length) * 10) / 10,
      count: records.length,
    };
  }

  function renderPurchasesTab() {
    const list = [...DB.state.purchases].sort((a, b) => b.no.localeCompare(a.no));
    // BUG-007：分頁。
    const { pageItems, totalPages, page: clampedPage } = Utils.paginate(list, purchasesPage, PURCHASES_PER_PAGE);
    purchasesPage = clampedPage;
    return `
      <div class="toolbar">
        <div class="spacer"></div>
        <button class="btn primary" id="btn-new-po">＋ 新增進貨單</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>進貨單號</th><th>供應商</th><th>進貨日期</th><th>品項數</th><th class="text-right">進貨金額</th><th>狀態</th><th></th></tr></thead>
            <tbody>
              ${pageItems.length ? pageItems.map((po) => `
                <tr>
                  <td class="nowrap">${po.no}</td>
                  <td>${Utils.escapeHtml(supplierName(po.supplierId))}</td>
                  <td class="nowrap">${po.date}</td>
                  <td class="text-center">${po.items.length}</td>
                  <td class="text-right">${Utils.money(poTotal(po))}</td>
                  <td>${po.status === '已入庫' ? '<span class="badge green">已入庫</span>' : '<span class="badge yellow">待入庫</span>'}</td>
                  <td class="nowrap">
                    <button class="btn sm" data-view="${po.id}">明細</button>
                    ${po.status !== '已入庫' ? `<button class="btn sm success" data-receive="${po.id}">確認入庫</button><button class="btn sm danger" data-del="${po.id}">刪除</button>` : ''}
                  </td>
                </tr>
              `).join('') : `<tr><td colspan="7"><div class="empty-state">尚無進貨單</div></td></tr>`}
            </tbody>
          </table>
        </div>
        ${Utils.paginationHtml(purchasesPage, totalPages)}
      </div>
    `;
  }

  function renderSuppliersTab() {
    const list = [...DB.state.suppliers];
    return `
      <div class="toolbar">
        <div class="spacer"></div>
        <button class="btn primary" id="btn-new-sup">＋ 新增供應商</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>供應商名稱</th><th>聯絡人</th><th>電話</th><th>備註</th><th></th></tr></thead>
            <tbody>
              ${list.length ? list.map((s) => `
                <tr>
                  <td>${Utils.escapeHtml(s.name)}</td>
                  <td>${Utils.escapeHtml(s.contact || '')}</td>
                  <td>${Utils.escapeHtml(s.phone || '')}</td>
                  <td class="muted">${Utils.escapeHtml(s.note || '')}</td>
                  <td class="nowrap"><button class="btn sm" data-edit-sup="${s.id}">編輯</button><button class="btn sm danger" data-del-sup="${s.id}">刪除</button></td>
                </tr>
              `).join('') : `<tr><td colspan="5"><div class="empty-state">尚無供應商資料</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function openSupplierForm(sup) {
    const isEdit = !!sup;
    sup = sup || { name: '', contact: '', phone: '', note: '' };
    Utils.openModal(`
      <div class="modal-title">${isEdit ? '編輯' : '新增'}供應商 <button class="icon-btn" id="modal-close">✕</button></div>
      <div class="field"><label>供應商名稱 *</label><input type="text" id="f-name" value="${Utils.escapeHtml(sup.name)}"></div>
      <div class="form-grid">
        <div class="field"><label>聯絡人</label><input type="text" id="f-contact" value="${Utils.escapeHtml(sup.contact)}"></div>
        <div class="field"><label>電話</label><input type="text" id="f-phone" value="${Utils.escapeHtml(sup.phone)}"></div>
      </div>
      <div class="field"><label>備註</label><textarea id="f-note">${Utils.escapeHtml(sup.note || '')}</textarea></div>
      <div class="modal-foot">
        <button class="btn" id="modal-cancel">取消</button>
        <button class="btn primary" id="btn-save">儲存</button>
      </div>
    `);
    document.getElementById('modal-close').onclick = Utils.closeModal;
    document.getElementById('modal-cancel').onclick = Utils.closeModal;
    let supplierSaved = false;
    document.getElementById('btn-save').onclick = (e) => {
      if (supplierSaved) return;
      const name = document.getElementById('f-name').value.trim();
      if (!name) { Utils.toast('請輸入供應商名稱', 'error'); return; }
      const data = { name, contact: document.getElementById('f-contact').value.trim(), phone: document.getElementById('f-phone').value.trim(), note: document.getElementById('f-note').value.trim() };
      supplierSaved = true;
      e.currentTarget.disabled = true;
      if (isEdit) Object.assign(sup, data);
      else DB.state.suppliers.push({ id: DB.uid('SUP'), ...data });
      DB.save(); Utils.closeModal(); Utils.toast('已儲存', 'success'); render();
    };
  }

  function openPOForm() {
    const s = DB.state;
    if (!s.suppliers.length) { Utils.toast('請先新增供應商', 'error'); return; }
    if (!s.products.length) { Utils.toast('請先新增商品', 'error'); return; }
    let items = [{ productId: s.products[0].id, qty: 1, cost: s.products[0].cost, expiryDate: '' }];
    let supplierId = s.suppliers[0].id;
    let poDate = DB.todayStr();
    let note = '';
    let aiQuery = '';
    // idle | loading | ai_error | matched_with_history | matched_no_history | not_found
    let aiStatus = 'idle';
    let aiMatchedProduct = null; // 比對到的既有商品（matched_with_history / matched_no_history 使用）
    let aiStats = null; // { recent, min, max, avg, count }（matched_with_history 使用）
    let aiNewProduct = { name: '', brand: '', spec: '', category: '', price: 0, cost: 0 }; // not_found 建立新商品用

    function rowsHtml() {
      return items.map((it, idx) => `
        <div class="flex gap-8" style="margin-bottom:8px;" data-row="${idx}">
          <select class="po-product" data-idx="${idx}" style="flex:2">
            ${s.products.map((p) => `<option value="${p.id}" ${p.id === it.productId ? 'selected' : ''}>${Utils.escapeHtml(p.name)}</option>`).join('')}
          </select>
          <input type="number" class="po-qty" data-idx="${idx}" value="${it.qty}" placeholder="數量" style="width:70px">
          <input type="number" class="po-cost" data-idx="${idx}" value="${it.cost}" placeholder="單位成本" style="width:90px">
          <input type="date" class="po-expiry" data-idx="${idx}" value="${it.expiryDate || ''}" title="效期（選填，將自動建立批號）" style="width:150px">
          <button class="icon-btn po-rm" data-idx="${idx}">✕</button>
        </div>
      `).join('');
    }

    function totalHtml() {
      const t = items.reduce((sum, it) => sum + it.qty * it.cost, 0);
      return `<div class="sum-row total"><span>進貨總金額</span><span>${Utils.money(t)}</span></div>`;
    }

    function aiPanelHtml() {
      let body = '';
      if (aiStatus === 'ai_error') {
        body = `<div class="hint" style="margin-top:8px;color:var(--danger);">AI 暫時無法使用，請稍後再試或自行手動新增品項。</div>`;
      } else if (aiStatus === 'matched_with_history') {
        const p = aiMatchedProduct;
        const st = aiStats;
        const sugLow = Math.min(st.min, st.recent);
        const sugHigh = Math.max(st.min, st.recent);
        body = `
          <div style="margin-top:10px;">🔍 AI 查價結果</div>
          <div style="margin:6px 0;font-weight:700;">${Utils.escapeHtml(p.brand || '')} ${Utils.escapeHtml(p.name)}${p.spec ? `<span class="muted small"> · 規格：${Utils.escapeHtml(p.spec)}</span>` : ''}</div>
          <div class="grid grid-4" style="margin:8px 0;">
            <div class="stat-card"><div class="label">最近一次</div><div class="value">${Utils.money(st.recent)}</div></div>
            <div class="stat-card"><div class="label">最低</div><div class="value">${Utils.money(st.min)}</div></div>
            <div class="stat-card"><div class="label">最高</div><div class="value">${Utils.money(st.max)}</div></div>
            <div class="stat-card"><div class="label">平均</div><div class="value">${Utils.money(st.avg)}</div></div>
          </div>
          <div class="muted small">歷史進貨次數：${st.count} 次</div>
          <div class="hint" style="margin-top:6px;">💡 建議採購價格：${Utils.money(sugLow)} ～ ${Utils.money(sugHigh)}</div>
          <div class="muted small" style="margin-top:4px;">以上價格為系統歷史進貨資料分析結果，僅供採購參考。</div>
          <button class="btn sm primary" id="btn-ai-add-item" style="margin-top:8px;">＋ 加入進貨單</button>
        `;
      } else if (aiStatus === 'matched_no_history') {
        const p = aiMatchedProduct;
        body = `
          <div style="margin-top:10px;">🔍 已比對到商品：${Utils.escapeHtml(p.brand || '')} ${Utils.escapeHtml(p.name)}</div>
          <div class="hint" style="color:var(--warn);">尚無歷史進貨價格。</div>
          <div class="muted small">將使用目前商品設定的成本 ${Utils.money(p.cost || 0)} 作為預設單價，加入後可自行調整。</div>
          <button class="btn sm primary" id="btn-ai-add-item-nohist" style="margin-top:8px;">＋ 加入進貨單</button>
        `;
      } else if (aiStatus === 'not_found') {
        body = `
          <div class="hint" style="margin-top:10px;color:var(--warn);">目前系統沒有此商品的歷史進貨價格。</div>
          <div class="muted small" style="margin-bottom:6px;">系統中找不到符合的商品，請確認以下資訊後建立新商品：</div>
          <div class="form-grid">
            <div class="field"><label>商品名稱 *</label><input type="text" id="ai-new-name" value="${Utils.escapeHtml(aiNewProduct.name)}"></div>
            <div class="field"><label>品牌</label><input type="text" id="ai-new-brand" value="${Utils.escapeHtml(aiNewProduct.brand)}"></div>
            <div class="field"><label>規格</label><input type="text" id="ai-new-spec" value="${Utils.escapeHtml(aiNewProduct.spec)}"></div>
            <div class="field"><label>分類</label>
              <select id="ai-new-cat">${s.productCategories.map((c) => `<option value="${Utils.escapeHtml(c.name)}" ${c.name === aiNewProduct.category ? 'selected' : ''}>${Utils.escapeHtml(c.name)}</option>`).join('')}</select>
            </div>
            <div class="field"><label>售價</label><input type="number" id="ai-new-price" value="${aiNewProduct.price}"></div>
            <div class="field"><label>進貨成本</label><input type="number" id="ai-new-cost" value="${aiNewProduct.cost}"></div>
          </div>
          <button class="btn sm primary" id="btn-ai-create">建立新商品並加入進貨單</button>
        `;
      }
      return `
        <div class="card" style="margin-bottom:14px;background:#faf7f1;">
          <div class="card-title">AI 查價小工具（試用功能）<span class="muted small" style="font-weight:400;">輸入品牌＋商品名稱＋規格，AI 協助解析後比對系統歷史進貨資料</span></div>
          <div class="flex gap-8">
            <input type="text" id="ai-query" value="${Utils.escapeHtml(aiQuery)}" placeholder="例如：皇家 幼貓飼料 2kg">
            <button class="btn sm primary" id="btn-ai-lookup" ${aiStatus === 'loading' ? 'disabled' : ''}>${aiStatus === 'loading' ? '查詢中...' : 'AI 查價'}</button>
          </div>
          ${body}
        </div>
      `;
    }

    function bodyHtml() {
      return `
        <div class="modal-title">新增進貨單 <button class="icon-btn" id="modal-close">✕</button></div>
        <div class="form-grid">
          <div class="field"><label>供應商 *</label>
            <select id="f-supplier">${s.suppliers.map((sup) => `<option value="${sup.id}" ${sup.id === supplierId ? 'selected' : ''}>${Utils.escapeHtml(sup.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label>進貨日期</label><input type="date" id="f-date" value="${poDate}"></div>
        </div>
        ${aiPanelHtml()}
        <div class="field"><label>進貨品項<span class="hint">（可選填效期，入庫時將自動建立批號紀錄）</span></label>
          <div id="po-rows">${rowsHtml()}</div>
          <button class="btn sm" id="btn-add-row">＋ 新增品項</button>
        </div>
        <div id="po-total">${totalHtml()}</div>
        <div class="field"><label>備註</label><textarea id="f-note">${Utils.escapeHtml(note)}</textarea></div>
        <div class="modal-foot">
          <button class="btn" id="modal-cancel">取消</button>
          <button class="btn primary" id="btn-save-po">儲存進貨單</button>
        </div>
      `;
    }

    function rerender() { Utils.openModal(bodyHtml(), { wide: true }); bind(); }

    function bind() {
      document.getElementById('modal-close').onclick = Utils.closeModal;
      document.getElementById('modal-cancel').onclick = Utils.closeModal;
      document.getElementById('f-supplier').onchange = (e) => { supplierId = e.target.value; };
      document.getElementById('f-date').onchange = (e) => { poDate = e.target.value || DB.todayStr(); };
      document.getElementById('f-note').oninput = (e) => { note = e.target.value; };
      document.getElementById('ai-query').oninput = (e) => { aiQuery = e.target.value; };
      document.getElementById('btn-ai-lookup').onclick = async () => {
        if (aiStatus === 'loading') return; // 避免查詢中被重複點擊，重複打 API
        const q = aiQuery.trim();
        if (!q) { Utils.toast('請輸入品牌＋商品名稱＋規格', 'error'); return; }
        aiStatus = 'loading';
        rerender();
        let parsed;
        try {
          const res = await fetch('/.netlify/functions/ai-parse-product-query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q }),
          });
          const data = await res.json();
          if (!data || data.ok !== true) { aiStatus = 'ai_error'; rerender(); return; }
          parsed = data;
        } catch (err) {
          aiStatus = 'ai_error';
          rerender();
          return;
        }

        // 以下比對「本機商品與歷史進貨資料」全部在前端進行：AI 只負責上面的語意解析，
        // 價格永遠來自 DB.state.purchases 裡真實存在的進貨紀錄，不會被 AI 憑空生成。
        const matched = findMatchingProduct(parsed, q);
        if (!matched) {
          aiMatchedProduct = null;
          aiStats = null;
          aiNewProduct = {
            name: [parsed.brand, parsed.productName].filter(Boolean).join(' ') || q,
            brand: parsed.brand || '',
            spec: parsed.specification || '',
            category: s.productCategories[0] ? s.productCategories[0].name : '',
            price: 0,
            cost: 0,
          };
          aiStatus = 'not_found';
          rerender();
          return;
        }

        aiMatchedProduct = matched;
        const stats = historicalStatsFor(matched.id);
        if (!stats) {
          aiStats = null;
          aiStatus = 'matched_no_history';
          rerender();
          return;
        }
        aiStats = stats;
        aiStatus = 'matched_with_history';
        rerender();
      };
      const btnAiAdd = document.getElementById('btn-ai-add-item');
      if (btnAiAdd) btnAiAdd.onclick = () => {
        items.push({ productId: aiMatchedProduct.id, qty: 1, cost: aiStats.recent, expiryDate: '' });
        Utils.toast('已加入進貨單', 'success');
        rerender();
      };
      const btnAiAddNoHist = document.getElementById('btn-ai-add-item-nohist');
      if (btnAiAddNoHist) btnAiAddNoHist.onclick = () => {
        items.push({ productId: aiMatchedProduct.id, qty: 1, cost: aiMatchedProduct.cost || 0, expiryDate: '' });
        Utils.toast('已加入進貨單', 'success');
        rerender();
      };
      const aiNewNameInp = document.getElementById('ai-new-name');
      if (aiNewNameInp) {
        aiNewNameInp.oninput = (e) => { aiNewProduct.name = e.target.value; };
        document.getElementById('ai-new-brand').oninput = (e) => { aiNewProduct.brand = e.target.value; };
        document.getElementById('ai-new-spec').oninput = (e) => { aiNewProduct.spec = e.target.value; };
        document.getElementById('ai-new-cat').onchange = (e) => { aiNewProduct.category = e.target.value; };
        document.getElementById('ai-new-price').oninput = (e) => { aiNewProduct.price = Number(e.target.value) || 0; };
        document.getElementById('ai-new-cost').oninput = (e) => { aiNewProduct.cost = Number(e.target.value) || 0; };
        document.getElementById('btn-ai-create').onclick = () => {
          const name = aiNewProduct.name.trim();
          if (!name) { Utils.toast('請輸入商品名稱', 'error'); return; }
          const np = {
            id: DB.uid('P'), name, category: aiNewProduct.category || '未分類',
            brand: aiNewProduct.brand.trim(), barcode: '', spec: aiNewProduct.spec.trim(), unit: '個',
            price: aiNewProduct.price, cost: aiNewProduct.cost, safetyStock: 3, stock: 0, enabled: true, batches: [],
          };
          s.products.push(np);
          DB.save();
          items.push({ productId: np.id, qty: 1, cost: np.cost, expiryDate: '' });
          Utils.toast('已建立新商品並加入進貨單', 'success');
          aiStatus = 'idle';
          aiQuery = '';
          rerender();
        };
      }
      document.getElementById('btn-add-row').onclick = () => {
        items.push({ productId: s.products[0].id, qty: 1, cost: s.products[0].cost, expiryDate: '' });
        rerender();
      };
      document.querySelectorAll('.po-rm').forEach((b) => b.onclick = () => {
        if (items.length === 1) { Utils.toast('至少保留一項', 'error'); return; }
        items.splice(Number(b.dataset.idx), 1); rerender();
      });
      document.querySelectorAll('.po-product').forEach((sel) => sel.onchange = (e) => {
        const idx = Number(e.target.dataset.idx);
        items[idx].productId = e.target.value;
        const p = s.products.find((pp) => pp.id === e.target.value);
        items[idx].cost = p ? p.cost : 0;
        rerender();
      });
      document.querySelectorAll('.po-qty').forEach((inp) => inp.oninput = (e) => {
        items[Number(e.target.dataset.idx)].qty = Number(e.target.value) || 0;
        document.getElementById('po-total').innerHTML = totalHtml();
      });
      document.querySelectorAll('.po-cost').forEach((inp) => inp.oninput = (e) => {
        items[Number(e.target.dataset.idx)].cost = Number(e.target.value) || 0;
        document.getElementById('po-total').innerHTML = totalHtml();
      });
      document.querySelectorAll('.po-expiry').forEach((inp) => inp.onchange = (e) => {
        items[Number(e.target.dataset.idx)].expiryDate = e.target.value || '';
      });
      let poSaved = false;
      document.getElementById('btn-save-po').onclick = (e) => {
        if (poSaved) return;
        const finalSupplierId = document.getElementById('f-supplier').value;
        const date = document.getElementById('f-date').value || DB.todayStr();
        if (items.some((it) => it.qty <= 0)) { Utils.toast('數量需大於 0', 'error'); return; }
        poSaved = true;
        e.currentTarget.disabled = true;
        const po = {
          id: DB.uid('PO'),
          no: 'PO-' + date.replace(/-/g, '') + '-' + String(s.purchases.length + 1).padStart(2, '0'),
          supplierId: finalSupplierId, date, items: items.map((it) => ({ ...it })),
          status: '待入庫', note: document.getElementById('f-note').value.trim(), createdAt: new Date().toISOString(),
        };
        s.purchases.push(po);
        DB.save(); Utils.closeModal(); Utils.toast('已建立進貨單，請確認入庫', 'success'); render();
      };
    }

    rerender();
  }

  function receivePO(po) {
    // 第二層防護：只有「待入庫」狀態才能執行入庫，避免同一張進貨單被重複觸發造成庫存重複增加。
    if (po.status !== '待入庫') return false;
    po.items.forEach((it) => {
      const p = DB.state.products.find((pp) => pp.id === it.productId);
      if (p) {
        p.stock += it.qty;
        p.cost = it.cost;
        if (it.expiryDate) {
          if (!p.batches) p.batches = [];
          p.batches.push({ id: DB.uid('B'), qty: it.qty, expiryDate: it.expiryDate, note: po.no, receivedDate: po.date });
        }
        DB.state.inventoryLogs.push({ id: DB.uid('LOG'), date: DB.todayStr(), productId: p.id, type: '進貨', qty: it.qty, note: po.no, stockAfter: p.stock, operator: DB.getCurrentUser().name });
      }
    });
    po.status = '已入庫';
    DB.save();
    return true;
  }

  function viewPO(po) {
    const rows = po.items.map((it) => `<tr><td>${Utils.escapeHtml(productName(it.productId))}</td><td class="text-center">${it.qty}</td><td class="text-right">${Utils.money(it.cost)}</td><td class="text-right">${Utils.money(it.qty * it.cost)}</td></tr>`).join('');
    Utils.openModal(`
      <div class="modal-title">進貨單明細 ${po.no} <button class="icon-btn" id="modal-close">✕</button></div>
      <div class="muted small" style="margin-bottom:10px;">供應商：${Utils.escapeHtml(supplierName(po.supplierId))} ｜ 日期：${po.date} ｜ 狀態：${po.status}</div>
      <div class="table-wrap"><table><thead><tr><th>商品</th><th class="text-center">數量</th><th class="text-right">單位成本</th><th class="text-right">小計</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="sum-row total"><span>總金額</span><span>${Utils.money(poTotal(po))}</span></div>
      ${po.note ? `<div class="field"><label>備註</label><div>${Utils.escapeHtml(po.note)}</div></div>` : ''}
      <div class="modal-foot"><button class="btn primary" id="modal-close2">關閉</button></div>
    `, { wide: true });
    document.getElementById('modal-close').onclick = Utils.closeModal;
    document.getElementById('modal-close2').onclick = Utils.closeModal;
  }

  function bind() {
    root().querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; purchasesPage = 1; render(); }));

    if (tab === 'purchases') {
      const pager = root().querySelector('.pagination');
      if (pager) pager.addEventListener('click', (e) => {
        if (e.target.dataset.pg === 'prev') { purchasesPage -= 1; render(); }
        else if (e.target.dataset.pg === 'next') { purchasesPage += 1; render(); }
      });
      const newBtn = document.getElementById('btn-new-po');
      if (newBtn) newBtn.addEventListener('click', openPOForm);
      root().querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => viewPO(DB.state.purchases.find((p) => p.id === b.dataset.view))));
      root().querySelectorAll('[data-receive]').forEach((b) => b.addEventListener('click', () => {
        if (b.disabled) return; // 第一層防護：處理中忽略後續點擊
        const po = DB.state.purchases.find((p) => p.id === b.dataset.receive);
        Utils.confirmModal('確認商品已到貨入庫嗎？系統將自動增加庫存。', () => {
          // 注意：confirmModal 為非同步，不可使用原始 click 事件的 e.currentTarget（此時已失效），
          // 改用 forEach 閉包捕捉到的按鈕元素 b。
          b.disabled = true;
          const ok = receivePO(po);
          if (ok) { Utils.toast('已入庫', 'success'); render(); }
          else { b.disabled = false; }
        });
      }));
      root().querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
        Utils.confirmModal('確定要刪除此進貨單嗎？', () => {
          DB.state.purchases = DB.state.purchases.filter((p) => p.id !== b.dataset.del);
          DB.save(); render(); Utils.toast('已刪除', 'success');
        });
      }));
    } else {
      const newBtn = document.getElementById('btn-new-sup');
      if (newBtn) newBtn.addEventListener('click', () => openSupplierForm(null));
      root().querySelectorAll('[data-edit-sup]').forEach((b) => b.addEventListener('click', () => openSupplierForm(DB.state.suppliers.find((s) => s.id === b.dataset.editSup))));
      root().querySelectorAll('[data-del-sup]').forEach((b) => b.addEventListener('click', () => {
        Utils.confirmModal('確定要刪除此供應商嗎？', () => {
          DB.state.suppliers = DB.state.suppliers.filter((s) => s.id !== b.dataset.delSup);
          DB.save(); render(); Utils.toast('已刪除', 'success');
        });
      }));
    }
  }

  function render() {
    root().innerHTML = `
      <div class="tabs">
        <button class="tab-btn ${tab === 'purchases' ? 'active' : ''}" data-tab="purchases">進貨單</button>
        <button class="tab-btn ${tab === 'suppliers' ? 'active' : ''}" data-tab="suppliers">供應商管理</button>
      </div>
      ${tab === 'purchases' ? renderPurchasesTab() : renderSuppliersTab()}
    `;
    bind();
  }

  return { render };
})();
