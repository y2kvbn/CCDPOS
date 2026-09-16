/* ========================================================================
 * settings.js - 系統設定
 * ======================================================================== */
const Settings = (() => {
  function root() { return document.getElementById('view-settings'); }

  function render() {
    const s = DB.state;
    root().innerHTML = `
      <div class="grid grid-2" style="align-items:start;">
        <div class="card">
          <div class="card-title">店家資訊</div>
          <div class="field"><label>店家名稱</label><input type="text" id="f-store-name" value="${Utils.escapeHtml(s.meta.storeName)}"></div>
          <button class="btn primary" id="btn-save-store">儲存</button>
        </div>

        <div class="card">
          <div class="card-title">人員管理</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>姓名</th><th>角色</th><th></th></tr></thead>
              <tbody>
                ${s.users.map((u) => `<tr><td>${Utils.escapeHtml(u.name)}</td><td>${u.role === 'admin' ? '管理員' : '店員'}</td><td><button class="btn sm" data-edit-user="${u.id}">編輯</button></td></tr>`).join('')}
              </tbody>
            </table>
          </div>
          <button class="btn sm" id="btn-add-user" style="margin-top:10px;">＋ 新增人員</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">折扣防弊政策（BUG-009）</div>
        <p class="muted small">此為防弊「機制」，實際門檻由店家自行決定，預設不限制（100% = 不限制）。設定後，POS 結帳時若折扣比例超過門檻，且「需要管理員授權」已開啟，則只有目前操作者為「管理員」角色時才能繼續，並會將折扣原因與操作者記錄於訂單中。</p>
        <div class="form-grid">
          <div class="field"><label>單筆訂單最高折扣比例（%）</label><input type="number" id="f-max-discount" min="0" max="100" value="${s.meta.discountPolicy.maxDiscountPercent}"></div>
          <div class="field"><label>超過門檻時</label>
            <label class="checkbox-row" style="margin-top:9px;"><input type="checkbox" id="f-manager-approval" ${s.meta.discountPolicy.managerApprovalRequired ? 'checked' : ''}> 需要「管理員」身份才能繼續結帳</label>
          </div>
        </div>
        <button class="btn primary" id="btn-save-discount-policy">儲存折扣政策</button>
      </div>

      <div class="card">
        <div class="card-title">商品售價規則（BUG-003）</div>
        <p class="muted small">商品表單「售價」標示為必填，預設不允許儲存 0 元商品。若店家有贈品/樣品等需要建立 0 元商品的情境，可於此開啟允許。</p>
        <label class="checkbox-row"><input type="checkbox" id="f-allow-zero-price" ${s.meta.allowZeroPricedProducts ? 'checked' : ''}> 允許商品售價為 0 元</label>
        <button class="btn primary" id="btn-save-price-policy" style="margin-top:10px;">儲存</button>
      </div>

      <div class="card">
        <div class="card-title">資料備份 / 還原</div>
        <p class="muted small">系統資料儲存於本機瀏覽器（localStorage）。建議定期匯出備份，更換裝置時可用匯入還原。</p>
        <div class="btn-row">
          <button class="btn" id="btn-export-data">匯出備份 (JSON)</button>
          <button class="btn" id="btn-import-data">匯入備份 (JSON)</button>
          <input type="file" id="import-file" accept="application/json" hidden>
          <button class="btn danger" id="btn-reset-all">重置為示範資料</button>
        </div>
      </div>
    `;

    document.getElementById('btn-save-store').addEventListener('click', () => {
      s.meta.storeName = document.getElementById('f-store-name').value.trim() || s.meta.storeName;
      DB.save();
      document.getElementById('store-name-label').textContent = s.meta.storeName;
      Utils.toast('已儲存', 'success');
    });

    document.getElementById('btn-save-discount-policy').addEventListener('click', () => {
      let pct = Number(document.getElementById('f-max-discount').value);
      if (isNaN(pct) || pct < 0) pct = 0;
      if (pct > 100) pct = 100;
      s.meta.discountPolicy.maxDiscountPercent = pct;
      s.meta.discountPolicy.managerApprovalRequired = document.getElementById('f-manager-approval').checked;
      DB.save();
      Utils.toast('已儲存折扣政策', 'success');
      render();
    });

    document.getElementById('btn-save-price-policy').addEventListener('click', () => {
      s.meta.allowZeroPricedProducts = document.getElementById('f-allow-zero-price').checked;
      DB.save();
      Utils.toast('已儲存', 'success');
    });

    document.getElementById('btn-add-user').addEventListener('click', () => openUserForm(null));
    root().querySelectorAll('[data-edit-user]').forEach((b) => b.addEventListener('click', () => {
      openUserForm(s.users.find((u) => u.id === b.dataset.editUser));
    }));

    document.getElementById('btn-export-data').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `pos-backup-${DB.todayStr()}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    document.getElementById('btn-import-data').addEventListener('click', () => document.getElementById('import-file').click());
    document.getElementById('import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!data.products || !data.posOrders || !data.reservations) throw new Error('格式不符');
          Utils.confirmModal('匯入將覆蓋目前所有資料，確定要繼續嗎？', () => {
            localStorage.setItem('petpos_v2', JSON.stringify(data));
            Utils.toast('匯入成功，重新載入中...', 'success');
            setTimeout(() => location.reload(), 600);
          });
        } catch (err) {
          Utils.toast('檔案格式錯誤，匯入失敗', 'error');
        }
      };
      reader.readAsText(file);
    });

    document.getElementById('btn-reset-all').addEventListener('click', () => {
      Utils.confirmModal('確定要重置為示範資料嗎？目前所有資料將會遺失。', () => {
        DB.reset();
        Utils.toast('已重置示範資料', 'success');
        App.renderOperatorSelect();
        render();
      });
    });
  }

  function openUserForm(user) {
    const isEdit = !!user;
    user = user || { name: '', role: 'staff', pin: '' };
    Utils.openModal(`
      <div class="modal-title">${isEdit ? '編輯' : '新增'}人員 <button class="icon-btn" id="modal-close">✕</button></div>
      <div class="field"><label>姓名 *</label><input type="text" id="f-name" value="${Utils.escapeHtml(user.name)}"></div>
      <div class="field"><label>角色</label>
        <select id="f-role">
          <option value="staff" ${user.role === 'staff' ? 'selected' : ''}>店員</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>管理員</option>
        </select>
      </div>
      <div class="modal-foot">
        <button class="btn" id="modal-cancel">取消</button>
        <button class="btn primary" id="btn-save-user">儲存</button>
      </div>
    `);
    document.getElementById('modal-close').onclick = Utils.closeModal;
    document.getElementById('modal-cancel').onclick = Utils.closeModal;
    let userSaved = false;
    document.getElementById('btn-save-user').onclick = (e) => {
      if (userSaved) return;
      const name = document.getElementById('f-name').value.trim();
      if (!name) { Utils.toast('請輸入姓名', 'error'); return; }
      const data = { name, role: document.getElementById('f-role').value };
      userSaved = true;
      e.currentTarget.disabled = true;
      if (isEdit) Object.assign(user, data);
      else DB.state.users.push({ id: DB.uid('U'), pin: '0000', ...data });
      DB.save(); Utils.closeModal(); Utils.toast('已儲存', 'success'); App.renderOperatorSelect(); render();
    };
  }

  return { render };
})();
