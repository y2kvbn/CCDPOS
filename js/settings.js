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
        <div class="card-title">會員集點與折抵政策</div>
        <p class="muted small">預設關閉，不影響現有結帳流程。開啟後，POS 結帳完成時會員會依消費金額自動累積點數，也可在結帳時用點數折抵金額；退款/作廢時會自動扣回已核發的點數、退回已折抵的點數。</p>
        <label class="checkbox-row"><input type="checkbox" id="f-loyalty-enabled" ${s.meta.loyaltyPolicy.enabled ? 'checked' : ''}> 啟用會員集點</label>
        <div class="form-grid" style="margin-top:10px;">
          <div class="field"><label>集點比例：每消費多少元得 1 點</label><input type="number" id="f-earn-amount" min="1" value="${s.meta.loyaltyPolicy.earnAmountPerPoint}"></div>
          <div class="field"><label>折抵比例：多少點可折抵 $1</label><input type="number" id="f-redeem-rate" min="1" value="${s.meta.loyaltyPolicy.redeemPointsPerDollar}"></div>
        </div>
        <button class="btn primary" id="btn-save-loyalty-policy">儲存集點政策</button>
      </div>

      <div class="card">
        <div class="card-title">優惠活動管理<button class="btn sm primary" id="btn-new-campaign">＋ 新增活動</button></div>
        <p class="muted small">建立期間限定的折扣活動，POS 結帳時只會顯示「目前日期在有效期間內」且已啟用的活動供選用。</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>活動名稱</th><th>折扣</th><th>最低消費</th><th>期間</th><th>已使用</th><th>狀態</th><th></th></tr></thead>
            <tbody>
              ${s.discountCampaigns.length ? s.discountCampaigns.map((c) => `
                <tr>
                  <td>${Utils.escapeHtml(c.name)}</td>
                  <td>${c.type === 'percent' ? c.value + '%' : Utils.money(c.value)}</td>
                  <td class="text-right">${Utils.money(c.minSpend || 0)}</td>
                  <td class="nowrap">${c.startDate} ~ ${c.endDate}</td>
                  <td class="text-right">${c.usedCount || 0}${c.usageLimit ? ' / ' + c.usageLimit : ''}</td>
                  <td>${c.enabled ? '<span class="badge green">啟用</span>' : '<span class="badge gray">停用</span>'}</td>
                  <td class="nowrap"><button class="btn sm" data-edit-campaign="${c.id}">編輯</button><button class="btn sm danger" data-del-campaign="${c.id}">刪除</button></td>
                </tr>
              `).join('') : `<tr><td colspan="7"><div class="empty-state">尚無優惠活動</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-title">贈品兌換目錄管理</div>
        <p class="muted small">此目錄用於會員管理頁「兌換贈品」功能，實際兌換動作請至「會員管理」頁面操作。</p>
        <div class="btn-row"><button class="btn sm" id="btn-goto-members">前往會員管理設定贈品</button></div>
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

    document.getElementById('btn-save-loyalty-policy').addEventListener('click', () => {
      let earnAmount = Number(document.getElementById('f-earn-amount').value);
      let redeemRate = Number(document.getElementById('f-redeem-rate').value);
      if (isNaN(earnAmount) || earnAmount < 1) earnAmount = 1;
      if (isNaN(redeemRate) || redeemRate < 1) redeemRate = 1;
      s.meta.loyaltyPolicy = {
        enabled: document.getElementById('f-loyalty-enabled').checked,
        earnAmountPerPoint: earnAmount,
        redeemPointsPerDollar: redeemRate,
      };
      DB.save();
      Utils.toast('已儲存集點政策', 'success');
      render();
    });

    document.getElementById('btn-new-campaign').addEventListener('click', () => openCampaignForm(null));
    root().querySelectorAll('[data-edit-campaign]').forEach((b) => b.addEventListener('click', () => {
      openCampaignForm(s.discountCampaigns.find((c) => c.id === b.dataset.editCampaign));
    }));
    root().querySelectorAll('[data-del-campaign]').forEach((b) => b.addEventListener('click', () => {
      const c = s.discountCampaigns.find((x) => x.id === b.dataset.delCampaign);
      Utils.confirmModal(`確定要刪除優惠活動「${Utils.escapeHtml(c.name)}」嗎？`, () => {
        s.discountCampaigns = s.discountCampaigns.filter((x) => x.id !== c.id);
        DB.save(); render(); Utils.toast('已刪除', 'success');
      });
    }));
    document.getElementById('btn-goto-members').addEventListener('click', () => App.go('members'));

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

  function openCampaignForm(campaign) {
    const isEdit = !!campaign;
    campaign = campaign || { name: '', type: 'percent', value: 0, minSpend: 0, startDate: DB.todayStr(), endDate: DB.todayStr(), usageLimit: null, enabled: true };
    Utils.openModal(`
      <div class="modal-title">${isEdit ? '編輯' : '新增'}優惠活動 <button class="icon-btn" id="modal-close">✕</button></div>
      <div class="field"><label>活動名稱 *</label><input type="text" id="f-name" value="${Utils.escapeHtml(campaign.name)}" placeholder="例如：中秋節慶優惠"></div>
      <div class="form-grid">
        <div class="field"><label>折扣類型</label>
          <select id="f-type">
            <option value="percent" ${campaign.type === 'percent' ? 'selected' : ''}>百分比折扣（%）</option>
            <option value="fixed" ${campaign.type === 'fixed' ? 'selected' : ''}>固定金額折扣（$）</option>
          </select>
        </div>
        <div class="field"><label>折扣數值 *</label><input type="number" id="f-value" min="0" value="${campaign.value}"></div>
        <div class="field"><label>最低消費門檻</label><input type="number" id="f-min-spend" min="0" value="${campaign.minSpend || 0}"></div>
        <div class="field"><label>使用次數上限（留空＝不限）</label><input type="number" id="f-usage-limit" min="1" value="${campaign.usageLimit || ''}"></div>
        <div class="field"><label>開始日期 *</label><input type="date" id="f-start" value="${campaign.startDate}"></div>
        <div class="field"><label>結束日期 *</label><input type="date" id="f-end" value="${campaign.endDate}"></div>
      </div>
      <label class="checkbox-row"><input type="checkbox" id="f-enabled" ${campaign.enabled ? 'checked' : ''}> 啟用</label>
      <div class="modal-foot">
        <button class="btn" id="modal-cancel">取消</button>
        <button class="btn primary" id="btn-save-campaign">儲存</button>
      </div>
    `);
    document.getElementById('modal-close').onclick = Utils.closeModal;
    document.getElementById('modal-cancel').onclick = Utils.closeModal;
    let saved = false;
    document.getElementById('btn-save-campaign').onclick = (e) => {
      if (saved) return;
      const name = document.getElementById('f-name').value.trim();
      if (!name) { Utils.toast('請輸入活動名稱', 'error'); return; }
      const startDate = document.getElementById('f-start').value;
      const endDate = document.getElementById('f-end').value;
      if (!startDate || !endDate) { Utils.toast('請填寫開始與結束日期', 'error'); return; }
      if (startDate > endDate) { Utils.toast('開始日期不可晚於結束日期', 'error'); return; }
      const value = Number(document.getElementById('f-value').value) || 0;
      if (value <= 0) { Utils.toast('折扣數值需大於 0', 'error'); return; }
      const usageLimitRaw = document.getElementById('f-usage-limit').value;
      const data = {
        name,
        type: document.getElementById('f-type').value,
        value,
        minSpend: Number(document.getElementById('f-min-spend').value) || 0,
        usageLimit: usageLimitRaw === '' ? null : Math.max(1, Number(usageLimitRaw) || 1),
        startDate, endDate,
        enabled: document.getElementById('f-enabled').checked,
      };
      saved = true;
      e.currentTarget.disabled = true;
      if (isEdit) Object.assign(campaign, data);
      else DB.state.discountCampaigns.push({ id: DB.uid('CAMP'), usedCount: 0, ...data });
      DB.save();
      Utils.closeModal();
      Utils.toast('已儲存', 'success');
      render();
    };
  }

  return { render };
})();
