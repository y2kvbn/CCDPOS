/* ========================================================================
 * products.js - 商品管理（商品列表 / 分類管理）
 * ======================================================================== */
const Products = (() => {
  let tab = 'list';
  let search = '';
  let categoryFilter = 'all';
  let onlyLow = false;
  const PLACEHOLDER_PHOTO = 'images/product-placeholder.jpg';

  function root() { return document.getElementById('view-products'); }

  function photoBox(photo, size = 'md') {
    const dims = size === 'sm' ? 'width:40px;height:40px;' : 'width:96px;height:96px;';
    return `<img src="${photo || PLACEHOLDER_PHOTO}" style="${dims}object-fit:cover;border-radius:10px;border:1px solid var(--line);flex-shrink:0;">`;
  }

  function categoryNames() {
    const managed = DB.state.productCategories.map((c) => c.name);
    const legacy = DB.state.products.map((p) => p.category).filter(Boolean);
    return Array.from(new Set([...managed, ...legacy]));
  }

  function categoryUsageCount(name) {
    return DB.state.products.filter((p) => p.category === name).length;
  }

  function list() {
    let arr = [...DB.state.products];
    if (categoryFilter !== 'all') arr = arr.filter((p) => p.category === categoryFilter);
    if (onlyLow) arr = arr.filter((p) => p.stock <= p.safetyStock);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter((p) => p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q) || (p.brand || '').toLowerCase().includes(q));
    }
    return arr.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  }

  function openForm(product) {
    const isEdit = !!product;
    product = product || { name: '', category: categoryNames()[0] || '', brand: '', barcode: '', spec: '', unit: '', price: 0, cost: 0, safetyStock: 3, stock: 0, enabled: true, photo: '', batches: [] };
    const cats = categoryNames();
    let photoData = product.photo || '';

    function photoSectionHtml() {
      return `
        <div id="photo-preview-wrap">${photoBox(photoData)}</div>
        <div class="field" style="flex:1;">
          <label>商品照片（一張，選填）</label>
          <input type="file" id="f-photo" accept="image/*">
          <div class="hint">未上傳時會顯示預設的「商品圖準備中」圖片；系統會自動壓縮縮圖</div>
          ${photoData ? `<button class="link-btn" id="btn-remove-photo" type="button">移除照片</button>` : ''}
        </div>
      `;
    }

    function bindPhotoSection() {
      document.getElementById('f-photo').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          photoData = await Utils.readImageAsDataURL(file, 480, 480, 0.85);
          document.getElementById('photo-section').innerHTML = photoSectionHtml();
          bindPhotoSection();
        } catch (err) {
          Utils.toast(err.message || '圖片讀取失敗', 'error');
        }
      };
      const rmBtn = document.getElementById('btn-remove-photo');
      if (rmBtn) rmBtn.onclick = () => {
        photoData = '';
        document.getElementById('photo-section').innerHTML = photoSectionHtml();
        bindPhotoSection();
      };
    }

    Utils.openModal(`
      <div class="modal-title">${isEdit ? '編輯商品' : '新增商品'} <button class="icon-btn" id="modal-close">✕</button></div>
      <div class="flex gap-8" id="photo-section" style="align-items:flex-start;margin-bottom:14px;">${photoSectionHtml()}</div>
      <div class="form-grid">
        <div class="field full"><label>商品名稱 *</label><input type="text" id="f-name" value="${Utils.escapeHtml(product.name)}"></div>
        <div class="field"><label>分類 *</label>
          <select id="f-product-cat">
            ${cats.length ? cats.map((c) => `<option value="${Utils.escapeHtml(c)}" ${product.category === c ? 'selected' : ''}>${Utils.escapeHtml(c)}</option>`).join('') : `<option value="未分類">未分類</option>`}
          </select>
          <div class="hint">找不到需要的分類？請至「分類管理」頁籤新增</div>
        </div>
        <div class="field"><label>品牌</label><input type="text" id="f-brand" value="${Utils.escapeHtml(product.brand)}"></div>
        <div class="field"><label>條碼</label><input type="text" id="f-barcode" value="${Utils.escapeHtml(product.barcode)}"></div>
        <div class="field"><label>規格</label><input type="text" id="f-spec" value="${Utils.escapeHtml(product.spec)}" placeholder="例：500ml/瓶"></div>
        <div class="field"><label>單位</label><input type="text" id="f-unit" value="${Utils.escapeHtml(product.unit)}" placeholder="瓶 / 包 / 個"></div>
        <div class="field"><label>售價 *</label><input type="number" id="f-price" value="${product.price}"></div>
        <div class="field"><label>成本</label><input type="number" id="f-cost" value="${product.cost}"></div>
        <div class="field"><label>安全庫存</label><input type="number" id="f-safety" value="${product.safetyStock}"></div>
        <div class="field"><label>目前庫存 ${isEdit ? '（請至庫存管理調整）' : ''}</label><input type="number" id="f-stock" value="${product.stock}" ${isEdit ? 'disabled' : ''}></div>
      </div>
      ${isEdit ? `<div class="hint">效期批號管理請至「庫存管理 &gt; 效期管理」新增，進貨入庫時亦可自動建立批號</div>` : ''}
      <label class="checkbox-row"><input type="checkbox" id="f-enabled" ${product.enabled ? 'checked' : ''}> 啟用（可於 POS 銷售）</label>
      <div class="modal-foot">
        <button class="btn" id="modal-cancel">取消</button>
        <button class="btn primary" id="btn-save">儲存</button>
      </div>
    `, { wide: true });

    document.getElementById('modal-close').onclick = Utils.closeModal;
    document.getElementById('modal-cancel').onclick = Utils.closeModal;
    bindPhotoSection();
    let productSaved = false;
    document.getElementById('btn-save').onclick = (e) => {
      if (productSaved) return; // 防止重複點擊建立兩筆商品
      const name = document.getElementById('f-name').value.trim();
      if (!name) { Utils.toast('請輸入商品名稱', 'error'); return; }
      const price = Number(document.getElementById('f-price').value) || 0;
      // BUG-003：售價標示必填(*)，預設不允許 0 元；店家如有贈品/樣品需求，
      // 可於「設定」頁開啟「允許商品售價為 0」。
      if (price <= 0 && !DB.state.meta.allowZeroPricedProducts) {
        Utils.toast('售價需大於 0（如為贈品/樣品，請至「設定」頁開啟允許 0 元商品）', 'error');
        return;
      }
      const data = {
        name,
        category: document.getElementById('f-product-cat').value || '未分類',
        brand: document.getElementById('f-brand').value.trim(),
        barcode: document.getElementById('f-barcode').value.trim(),
        spec: document.getElementById('f-spec').value.trim(),
        unit: document.getElementById('f-unit').value.trim() || '件',
        price,
        cost: Number(document.getElementById('f-cost').value) || 0,
        safetyStock: Number(document.getElementById('f-safety').value) || 0,
        enabled: document.getElementById('f-enabled').checked,
        photo: photoData,
      };
      productSaved = true;
      e.currentTarget.disabled = true;
      if (isEdit) {
        Object.assign(product, data);
      } else {
        data.stock = Number(document.getElementById('f-stock').value) || 0;
        data.batches = [];
        const np = { id: DB.uid('P'), ...data };
        DB.state.products.push(np);
        if (np.stock > 0) {
          DB.state.inventoryLogs.push({ id: DB.uid('LOG'), date: DB.todayStr(), productId: np.id, type: '期初建檔', qty: np.stock, note: '新增商品期初庫存', stockAfter: np.stock, operator: DB.getCurrentUser().name });
        }
      }
      DB.save();
      Utils.closeModal();
      Utils.toast('已儲存', 'success');
      render();
    };
  }

  function openCategoryForm(cat) {
    const isEdit = !!cat;
    Utils.openModal(`
      <div class="modal-title">${isEdit ? '編輯分類' : '新增分類'} <button class="icon-btn" id="modal-close">✕</button></div>
      <div class="field"><label>分類名稱 *</label><input type="text" id="f-name" value="${isEdit ? Utils.escapeHtml(cat.name) : ''}" placeholder="例：保健品"></div>
      <div class="modal-foot">
        <button class="btn" id="modal-cancel">取消</button>
        <button class="btn primary" id="btn-save-cat">儲存</button>
      </div>
    `);
    document.getElementById('modal-close').onclick = Utils.closeModal;
    document.getElementById('modal-cancel').onclick = Utils.closeModal;
    document.getElementById('btn-save-cat').onclick = () => {
      const name = document.getElementById('f-name').value.trim();
      if (!name) { Utils.toast('請輸入分類名稱', 'error'); return; }
      const dup = DB.state.productCategories.find((c) => c.name === name && (!isEdit || c.id !== cat.id));
      if (dup) { Utils.toast('已有相同名稱的分類', 'error'); return; }
      if (isEdit) {
        const oldName = cat.name;
        cat.name = name;
        if (oldName !== name) {
          DB.state.products.forEach((p) => { if (p.category === oldName) p.category = name; });
        }
      } else {
        DB.state.productCategories.push({ id: DB.uid('CAT'), name });
      }
      DB.save();
      Utils.closeModal();
      Utils.toast('已儲存', 'success');
      render();
    };
  }

  function renderListTab() {
    const arr = list();
    const cats = categoryNames();
    return `
      <div class="toolbar">
        <div class="search-box"><span>🔍</span><input type="text" id="f-product-search" placeholder="搜尋名稱 / 品牌 / 條碼" value="${Utils.escapeHtml(search)}"></div>
        <select id="f-cat">
          <option value="all" ${categoryFilter === 'all' ? 'selected' : ''}>全部分類</option>
          ${cats.map((c) => `<option value="${Utils.escapeHtml(c)}" ${categoryFilter === c ? 'selected' : ''}>${Utils.escapeHtml(c)}</option>`).join('')}
        </select>
        <label class="checkbox-row"><input type="checkbox" id="f-low" ${onlyLow ? 'checked' : ''}> 只顯示低於安全庫存</label>
        <div class="spacer"></div>
        <button class="btn primary" id="btn-new">＋ 新增商品</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th></th><th>商品名稱</th><th>分類</th><th>品牌</th><th>條碼</th><th>規格</th><th class="text-right">售價</th><th class="text-right">成本</th><th class="text-right">庫存</th><th>狀態</th><th></th></tr></thead>
            <tbody>
              ${arr.length ? arr.map((p) => `
                <tr>
                  <td>${photoBox(p.photo, 'sm')}</td>
                  <td>${Utils.escapeHtml(p.name)}</td>
                  <td>${Utils.escapeHtml(p.category)}</td>
                  <td class="muted">${Utils.escapeHtml(p.brand || '')}</td>
                  <td class="muted nowrap">${Utils.escapeHtml(p.barcode || '')}</td>
                  <td class="muted">${Utils.escapeHtml(p.spec || '')}</td>
                  <td class="text-right">${Utils.money(p.price)}</td>
                  <td class="text-right muted">${Utils.money(p.cost)}</td>
                  <td class="text-right">${p.stock} ${p.stock <= p.safetyStock ? '<span class="badge yellow">低庫存</span>' : ''}</td>
                  <td>${p.enabled ? '<span class="badge green">啟用</span>' : '<span class="badge gray">停用</span>'}</td>
                  <td class="nowrap"><button class="btn sm" data-edit="${p.id}">編輯</button><button class="btn sm danger" data-del="${p.id}">刪除</button></td>
                </tr>
              `).join('') : `<tr><td colspan="11"><div class="empty-state">找不到商品，試試調整篩選條件</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderCategoriesTab() {
    const cats = DB.state.productCategories;
    return `
      <div class="toolbar">
        <div class="spacer"></div>
        <button class="btn primary" id="btn-new-cat">＋ 新增分類</button>
      </div>
      <div class="card">
        <p class="muted small">這裡管理的是「商品分類」標籤（例如：飼料、零食、用品、保健品），會同步顯示於 POS 收銀的分類頁籤。美容 / 寄養 / 安親為訂單固定類別，其服務項目請至「訂單管理 &gt; 服務項目設定」編輯。</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>分類名稱</th><th class="text-right">使用中商品數</th><th></th></tr></thead>
            <tbody>
              ${cats.length ? cats.map((c) => `
                <tr>
                  <td>${Utils.escapeHtml(c.name)}</td>
                  <td class="text-right">${categoryUsageCount(c.name)}</td>
                  <td class="nowrap"><button class="btn sm" data-edit-cat="${c.id}">編輯</button><button class="btn sm danger" data-del-cat="${c.id}">刪除</button></td>
                </tr>
              `).join('') : `<tr><td colspan="3"><div class="empty-state">尚無分類，點選右上角新增</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function bind() {
    root().querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));

    if (tab === 'list') {
      Utils.bindSearchInput('f-product-search', (v) => { search = v; render(); });
      document.getElementById('f-cat').addEventListener('change', (e) => { categoryFilter = e.target.value; render(); });
      document.getElementById('f-low').addEventListener('change', (e) => { onlyLow = e.target.checked; render(); });
      document.getElementById('btn-new').addEventListener('click', () => openForm(null));
      root().querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
        openForm(DB.state.products.find((p) => p.id === b.dataset.edit));
      }));
      root().querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
        const p = DB.state.products.find((pp) => pp.id === b.dataset.del);
        Utils.confirmModal(`確定要刪除「${p.name}」嗎？此動作無法復原。`, () => {
          DB.state.products = DB.state.products.filter((pp) => pp.id !== p.id);
          DB.save(); render(); Utils.toast('已刪除', 'success');
        });
      }));
    } else {
      document.getElementById('btn-new-cat').addEventListener('click', () => openCategoryForm(null));
      root().querySelectorAll('[data-edit-cat]').forEach((b) => b.addEventListener('click', () => {
        openCategoryForm(DB.state.productCategories.find((c) => c.id === b.dataset.editCat));
      }));
      root().querySelectorAll('[data-del-cat]').forEach((b) => b.addEventListener('click', () => {
        const c = DB.state.productCategories.find((x) => x.id === b.dataset.delCat);
        const count = categoryUsageCount(c.name);
        const msg = count > 0
          ? `此分類目前有 ${count} 項商品使用中，刪除後這些商品將改為「未分類」，確定要刪除嗎？`
          : '確定要刪除此分類嗎？';
        Utils.confirmModal(msg, () => {
          DB.state.products.forEach((p) => { if (p.category === c.name) p.category = '未分類'; });
          DB.state.productCategories = DB.state.productCategories.filter((x) => x.id !== c.id);
          DB.save(); render(); Utils.toast('已刪除', 'success');
        });
      }));
    }
  }

  function render() {
    root().innerHTML = `
      <div class="tabs">
        <button class="tab-btn ${tab === 'list' ? 'active' : ''}" data-tab="list">商品列表</button>
        <button class="tab-btn ${tab === 'categories' ? 'active' : ''}" data-tab="categories">分類管理</button>
      </div>
      ${tab === 'list' ? renderListTab() : renderCategoriesTab()}
    `;
    bind();
  }

  return { render };
})();
