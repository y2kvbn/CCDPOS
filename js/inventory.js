/* ========================================================================
 * inventory.js - 庫存管理（即時庫存 / 異動紀錄 / 盤點 / 效期管理）
 * ======================================================================== */
const Inventory = (() => {
  let tab = 'stock';
  let logsPage = 1;
  const LOGS_PER_PAGE = 50;
  const ADJUST_TYPES = ['盤盈', '盤虧', '報廢', '自用', '贈送', '調整'];

  function root() { return document.getElementById('view-inventory'); }
  function productName(id) { const p = DB.state.products.find((x) => x.id === id); return p ? p.name : '(已刪除商品)'; }

  function renderStockTab() {
    const list = [...DB.state.products].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    return `
      <div class="grid grid-4" style="margin-bottom:16px;">
        <div class="stat-card"><div class="label">商品總數</div><div class="value">${list.length}</div></div>
        <div class="stat-card"><div class="label">低於安全庫存</div><div class="value" style="color:var(--warn)">${list.filter((p) => p.stock <= p.safetyStock).length}</div></div>
        <div class="stat-card"><div class="label">庫存總值（成本）</div><div class="value">${Utils.money(list.reduce((s, p) => s + p.stock * p.cost, 0))}</div></div>
        <div class="stat-card"><div class="label">缺貨（0）</div><div class="value" style="color:var(--danger)">${list.filter((p) => p.stock <= 0).length}</div></div>
      </div>
      <div class="card">
        <div class="card-title">即時庫存</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>商品名稱</th><th>分類</th><th class="text-right">目前庫存</th><th class="text-right">安全庫存</th><th>狀態</th><th></th></tr></thead>
            <tbody>
              ${list.map((p) => `
                <tr>
                  <td>${Utils.escapeHtml(p.name)}</td>
                  <td class="muted">${Utils.escapeHtml(p.category)}</td>
                  <td class="text-right nowrap">${p.stock} ${Utils.escapeHtml(p.unit || '')}</td>
                  <td class="text-right muted">${p.safetyStock}</td>
                  <td>${p.stock <= 0 ? '<span class="badge red">缺貨</span>' : p.stock <= p.safetyStock ? '<span class="badge yellow">偏低</span>' : '<span class="badge green">正常</span>'}</td>
                  <td><button class="btn sm" data-adjust="${p.id}">庫存調整</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderLogsTab() {
    const logs = [...DB.state.inventoryLogs].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
    // BUG-007：分頁。
    const { pageItems, totalPages, page: clampedPage } = Utils.paginate(logs, logsPage, LOGS_PER_PAGE);
    logsPage = clampedPage;
    return `
      <div class="card">
        <div class="card-title">庫存異動紀錄</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>日期</th><th>商品</th><th>類型</th><th class="text-right">異動數量</th><th class="text-right">異動後庫存</th><th>操作者</th><th>備註</th></tr></thead>
            <tbody>
              ${pageItems.length ? pageItems.map((l) => `
                <tr>
                  <td class="nowrap">${l.date}</td>
                  <td>${Utils.escapeHtml(productName(l.productId))}</td>
                  <td><span class="badge ${l.qty >= 0 ? 'green' : 'red'}">${l.type}</span></td>
                  <td class="text-right ${l.qty >= 0 ? '' : 'muted'}">${l.qty >= 0 ? '+' : ''}${l.qty}</td>
                  <td class="text-right">${l.stockAfter}</td>
                  <td class="muted">${Utils.escapeHtml(l.operator || '-')}</td>
                  <td class="muted">${Utils.escapeHtml(l.note || '')}</td>
                </tr>
              `).join('') : `<tr><td colspan="7"><div class="empty-state">尚無異動紀錄</div></td></tr>`}
            </tbody>
          </table>
        </div>
        ${Utils.paginationHtml(logsPage, totalPages)}
      </div>
    `;
  }

  function renderStocktakeTab() {
    const list = [...DB.state.products].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    return `
      <div class="card">
        <div class="card-title">盤點作業<span class="muted small">輸入實際盤點數量，系統將自動計算差異並產生調整紀錄</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>商品名稱</th><th class="text-right">系統庫存</th><th class="text-right">實際盤點數量</th><th class="text-right">差異</th></tr></thead>
            <tbody id="stocktake-body">
              ${list.map((p) => `
                <tr data-pid="${p.id}">
                  <td>${Utils.escapeHtml(p.name)}</td>
                  <td class="text-right muted">${p.stock}</td>
                  <td class="text-right"><input type="text" class="st-count" data-id="${p.id}" style="width:80px;text-align:right;" value="${p.stock}"></td>
                  <td class="text-right st-diff" data-diff="${p.id}">0</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="btn-row" style="margin-top:14px;">
          <button class="btn primary" id="btn-submit-stocktake">送出盤點結果</button>
        </div>
      </div>
    `;
  }

  function allBatchRows() {
    const rows = [];
    DB.state.products.forEach((p) => {
      (p.batches || []).forEach((b) => rows.push({ product: p, batch: b }));
    });
    return rows.sort((a, b) => (a.batch.expiryDate || '').localeCompare(b.batch.expiryDate || ''));
  }

  function renderExpiryTab() {
    const rows = allBatchRows();
    const today = DB.todayStr();
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    return `
      <div class="card">
        <div class="card-title">效期管理（依批號）
          <button class="btn sm primary" id="btn-new-batch">＋ 新增批號</button>
        </div>
        <p class="muted small">依進貨批號記錄各批商品的數量與效期，可於進貨入庫時自動建立，或於此手動新增/調整。</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>商品名稱</th><th>批號/備註</th><th class="text-right">數量</th><th>入庫日期</th><th>到期日</th><th>狀態</th><th></th></tr></thead>
            <tbody>
              ${rows.length ? rows.map(({ product: p, batch: b }) => {
                let st = '<span class="badge green">正常</span>';
                if (!b.expiryDate) st = '<span class="badge gray">未設定</span>';
                else if (b.expiryDate < today) st = '<span class="badge red">已過期</span>';
                else if (b.expiryDate <= in30) st = '<span class="badge yellow">即將到期</span>';
                return `
                  <tr>
                    <td>${Utils.escapeHtml(p.name)}</td>
                    <td class="muted">${Utils.escapeHtml(b.note || '-')}</td>
                    <td class="text-right">${b.qty} ${Utils.escapeHtml(p.unit || '')}</td>
                    <td class="nowrap muted">${b.receivedDate || ''}</td>
                    <td class="nowrap">${b.expiryDate || '未設定'}</td>
                    <td>${st}</td>
                    <td class="nowrap"><button class="btn sm" data-edit-batch="${p.id}|${b.id}">編輯</button><button class="btn sm danger" data-del-batch="${p.id}|${b.id}">刪除</button></td>
                  </tr>
                `;
              }).join('') : `<tr><td colspan="7"><div class="empty-state">尚無批號資料，可點選「新增批號」開始記錄效期</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function openBatchForm(product, batch) {
    const isEdit = !!batch;
    const s = DB.state;
    batch = batch || { qty: 1, expiryDate: '', note: '', receivedDate: DB.todayStr() };
    Utils.openModal(`
      <div class="modal-title">${isEdit ? '編輯' : '新增'}批號 <button class="icon-btn" id="modal-close">✕</button></div>
      <div class="field"><label>商品 *</label>
        <select id="f-product" ${isEdit ? 'disabled' : ''}>
          ${s.products.map((p) => `<option value="${p.id}" ${product && p.id === product.id ? 'selected' : ''}>${Utils.escapeHtml(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-grid">
        <div class="field"><label>數量 *</label><input type="number" id="f-qty" value="${batch.qty}" min="0"></div>
        <div class="field"><label>到期日</label><input type="date" id="f-expiry" value="${batch.expiryDate || ''}"></div>
        <div class="field"><label>入庫日期</label><input type="date" id="f-received" value="${batch.receivedDate || DB.todayStr()}"></div>
        <div class="field"><label>批號/備註</label><input type="text" id="f-note" value="${Utils.escapeHtml(batch.note || '')}" placeholder="例：批20260901"></div>
      </div>
      <div class="hint">批號數量為獨立記錄，用於效期追蹤；商品實際庫存請至「即時庫存」使用庫存調整功能維護。</div>
      <div class="modal-foot">
        <button class="btn" id="modal-cancel">取消</button>
        <button class="btn primary" id="btn-save-batch">儲存</button>
      </div>
    `);
    let saved = false;
    document.getElementById('modal-close').onclick = Utils.closeModal;
    document.getElementById('modal-cancel').onclick = Utils.closeModal;
    document.getElementById('btn-save-batch').onclick = (e) => {
      if (saved) return;
      const productId = isEdit ? product.id : document.getElementById('f-product').value;
      const p = s.products.find((x) => x.id === productId);
      if (!p) { Utils.toast('找不到商品', 'error'); return; }
      const data = {
        qty: Number(document.getElementById('f-qty').value) || 0,
        expiryDate: document.getElementById('f-expiry').value || '',
        receivedDate: document.getElementById('f-received').value || DB.todayStr(),
        note: document.getElementById('f-note').value.trim(),
      };
      saved = true;
      e.currentTarget.disabled = true;
      if (!p.batches) p.batches = [];
      if (isEdit) Object.assign(batch, data);
      else p.batches.push({ id: DB.uid('B'), ...data });
      DB.save();
      Utils.closeModal();
      Utils.toast('已儲存', 'success');
      render();
    };
  }

  function openAdjustModal(product) {
    Utils.openModal(`
      <div class="modal-title">庫存調整 - ${Utils.escapeHtml(product.name)} <button class="icon-btn" id="modal-close">✕</button></div>
      <div class="muted small" style="margin-bottom:10px;">目前庫存：${product.stock} ${Utils.escapeHtml(product.unit || '')}</div>
      <div class="form-grid">
        <div class="field"><label>調整類型</label>
          <select id="f-type">${ADJUST_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
        </div>
        <div class="field"><label>異動數量</label><input type="number" id="f-qty" value="1" min="1"></div>
      </div>
      <div class="hint" style="margin:-6px 0 10px;">盤盈 / 自用取消 / 贈送取消等增加庫存；盤虧 / 報廢 / 自用 / 贈送 減少庫存</div>
      <div class="field"><label>方向</label>
        <select id="f-dir">
          <option value="1">增加庫存（+）</option>
          <option value="-1">減少庫存（－）</option>
        </select>
      </div>
      <div class="field"><label>備註</label><textarea id="f-note" placeholder="原因說明"></textarea></div>
      <div class="modal-foot">
        <button class="btn" id="modal-cancel">取消</button>
        <button class="btn primary" id="btn-apply">確認調整</button>
      </div>
    `);
    let applied = false; // 防止重複送出（快速連點/重複觸發）造成庫存被調整兩次
    document.getElementById('modal-close').onclick = Utils.closeModal;
    document.getElementById('modal-cancel').onclick = Utils.closeModal;
    document.getElementById('btn-apply').onclick = (e) => {
      if (applied) return; // 第二層防護：即使按鈕鎖定被繞過，仍再次確認尚未套用過
      const type = document.getElementById('f-type').value;
      const dir = Number(document.getElementById('f-dir').value);
      let qty = Number(document.getElementById('f-qty').value) || 0;
      if (qty <= 0) { Utils.toast('請輸入正確數量', 'error'); return; }
      qty = qty * dir;
      if (product.stock + qty < 0) { Utils.toast('調整後庫存不可小於 0', 'error'); return; }
      applied = true;
      e.currentTarget.disabled = true; // 第一層防護：立即鎖定按鈕
      product.stock += qty;
      DB.state.inventoryLogs.push({
        id: DB.uid('LOG'), date: DB.todayStr(), productId: product.id, type, qty,
        note: document.getElementById('f-note').value.trim(), stockAfter: product.stock,
        operator: DB.getCurrentUser().name,
      });
      DB.save();
      Utils.closeModal();
      Utils.toast('已完成庫存調整', 'success');
      render();
    };
  }

  function bind() {
    root().querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; logsPage = 1; render(); }));

    if (tab === 'stock') {
      root().querySelectorAll('[data-adjust]').forEach((b) => b.addEventListener('click', () => {
        openAdjustModal(DB.state.products.find((p) => p.id === b.dataset.adjust));
      }));
    }

    if (tab === 'logs') {
      const pager = root().querySelector('.pagination');
      if (pager) pager.addEventListener('click', (e) => {
        if (e.target.dataset.pg === 'prev') { logsPage -= 1; render(); }
        else if (e.target.dataset.pg === 'next') { logsPage += 1; render(); }
      });
    }

    if (tab === 'expiry') {
      const newBtn = document.getElementById('btn-new-batch');
      if (newBtn) newBtn.addEventListener('click', () => openBatchForm(DB.state.products[0], null));
      root().querySelectorAll('[data-edit-batch]').forEach((b) => b.addEventListener('click', () => {
        const [pid, bid] = b.dataset.editBatch.split('|');
        const p = DB.state.products.find((x) => x.id === pid);
        openBatchForm(p, p.batches.find((x) => x.id === bid));
      }));
      root().querySelectorAll('[data-del-batch]').forEach((b) => b.addEventListener('click', () => {
        const [pid, bid] = b.dataset.delBatch.split('|');
        Utils.confirmModal('確定要刪除此批號紀錄嗎？（不會變動商品實際庫存）', () => {
          const p = DB.state.products.find((x) => x.id === pid);
          p.batches = p.batches.filter((x) => x.id !== bid);
          DB.save(); render(); Utils.toast('已刪除', 'success');
        });
      }));
    }

    if (tab === 'stocktake') {
      const recalc = (id) => {
        const p = DB.state.products.find((x) => x.id === id);
        const input = root().querySelector(`.st-count[data-id="${id}"]`);
        const diffCell = root().querySelector(`.st-diff[data-diff="${id}"]`);
        const val = Number(input.value) || 0;
        const diff = val - p.stock;
        diffCell.textContent = (diff >= 0 ? '+' : '') + diff;
        diffCell.style.color = diff === 0 ? '' : diff > 0 ? 'var(--success)' : 'var(--danger)';
      };
      root().querySelectorAll('.st-count').forEach((inp) => {
        inp.addEventListener('input', () => recalc(inp.dataset.id));
      });
      let stocktakeSubmitting = false;
      const submitBtn = document.getElementById('btn-submit-stocktake');
      submitBtn.addEventListener('click', () => {
        if (stocktakeSubmitting) return; // 第二層防護
        const rows = Array.from(root().querySelectorAll('.st-count'));
        const changes = rows.map((inp) => {
          const p = DB.state.products.find((x) => x.id === inp.dataset.id);
          const val = Number(inp.value) || 0;
          return { p, diff: val - p.stock };
        }).filter((c) => c.diff !== 0);
        if (!changes.length) { Utils.toast('沒有需要調整的項目', 'info'); return; }
        Utils.confirmModal(`共 ${changes.length} 項商品有盤點差異，確定要送出並更新庫存嗎？`, () => {
          // 注意：confirmModal 為非同步，不可使用原始 click 事件的 e.currentTarget（此時已失效）。
          if (stocktakeSubmitting) return; // 第二層防護
          stocktakeSubmitting = true;
          submitBtn.disabled = true; // 第一層防護
          changes.forEach(({ p, diff }) => {
            p.stock += diff;
            DB.state.inventoryLogs.push({ id: DB.uid('LOG'), date: DB.todayStr(), productId: p.id, type: diff > 0 ? '盤盈' : '盤虧', qty: diff, note: '盤點作業', stockAfter: p.stock, operator: DB.getCurrentUser().name });
          });
          DB.save();
          Utils.toast('盤點已完成，庫存已更新', 'success');
          render();
        });
      });
    }
  }

  function render() {
    root().innerHTML = `
      <div class="tabs">
        <button class="tab-btn ${tab === 'stock' ? 'active' : ''}" data-tab="stock">即時庫存</button>
        <button class="tab-btn ${tab === 'logs' ? 'active' : ''}" data-tab="logs">異動紀錄</button>
        <button class="tab-btn ${tab === 'stocktake' ? 'active' : ''}" data-tab="stocktake">盤點</button>
        <button class="tab-btn ${tab === 'expiry' ? 'active' : ''}" data-tab="expiry">效期管理</button>
      </div>
      ${tab === 'stock' ? renderStockTab() : tab === 'logs' ? renderLogsTab() : tab === 'stocktake' ? renderStocktakeTab() : renderExpiryTab()}
    `;
    bind();
  }

  return { render };
})();
