/* ========================================================================
 * members.js - 會員管理（BUG-006；含多寵物與儲值金，參考原系統設計）
 * ======================================================================== */
const Members = (() => {
  let search = '';
  let tab = 'members';

  function root() { return document.getElementById('view-members'); }

  function petsLabel(m) {
    return (m.pets || []).map((p) => p.name + (p.type ? `（${p.type}）` : '')).join('、');
  }

  function list() {
    let arr = [...DB.state.members].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter((m) => m.name.toLowerCase().includes(q) || (m.phone || '').includes(q) || (m.email || '').toLowerCase().includes(q) || (m.pets || []).some((p) => p.name.toLowerCase().includes(q)));
    }
    return arr;
  }

  function petRows() {
    const rows = [];
    DB.state.members.forEach((m) => (m.pets || []).forEach((p) => rows.push({ pet: p, member: m })));
    rows.sort((a, b) => a.pet.name.localeCompare(b.pet.name, 'zh-Hant'));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return rows.filter(({ pet, member }) => pet.name.toLowerCase().includes(q) || member.name.toLowerCase().includes(q) || (member.phone || '').includes(q));
    }
    return rows;
  }

  function ordersOf(memberId) {
    return DB.state.posOrders.filter((o) => o.memberId === memberId).sort((a, b) => b.datetime.localeCompare(a.datetime));
  }

  function statsOf(memberId) {
    const valid = ordersOf(memberId).filter((o) => o.status === '完成');
    return { count: valid.length, total: valid.reduce((s, o) => s + o.total, 0) };
  }

  function balanceLogsOf(memberId) {
    return DB.state.memberBalanceLogs.filter((l) => l.memberId === memberId).sort((a, b) => b.datetime.localeCompare(a.datetime));
  }

  function pointLogsOf(memberId) {
    return DB.state.memberPointLogs.filter((l) => l.memberId === memberId).sort((a, b) => b.datetime.localeCompare(a.datetime));
  }

  function loyaltyEnabled() {
    return !!DB.state.meta.loyaltyPolicy.enabled;
  }

  function renderMembersTab() {
    const arr = list();
    const showPoints = loyaltyEnabled();
    return `
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>會員姓名</th><th>電話</th><th>Email</th><th>地址</th><th>寵物</th><th class="text-right">儲值金</th>${showPoints ? '<th class="text-right">點數</th>' : ''}<th class="text-right">消費次數</th><th class="text-right">累積消費</th><th></th></tr></thead>
            <tbody>
              ${arr.length ? arr.map((m) => {
                const st = statsOf(m.id);
                return `
                <tr>
                  <td>${Utils.escapeHtml(m.name)}</td>
                  <td class="nowrap">${Utils.escapeHtml(m.phone || '')}</td>
                  <td>${Utils.escapeHtml(m.email || '')}</td>
                  <td class="muted nowrap">${Utils.escapeHtml(m.address || '')}</td>
                  <td>${Utils.escapeHtml(petsLabel(m))}</td>
                  <td class="text-right">${Utils.money(m.balance || 0)}</td>
                  ${showPoints ? `<td class="text-right">${m.points || 0}</td>` : ''}
                  <td class="text-right">${st.count}</td>
                  <td class="text-right">${Utils.money(st.total)}</td>
                  <td class="nowrap">
                    <button class="btn sm" data-topup="${m.id}">儲值</button>
                    ${showPoints ? `<button class="btn sm" data-adjust-points="${m.id}">調整點數</button><button class="btn sm" data-redeem-gift="${m.id}">兌換贈品</button>` : ''}
                    <button class="btn sm" data-detail="${m.id}">消費紀錄</button>
                    <button class="btn sm" data-edit="${m.id}">編輯</button>
                    <button class="btn sm danger" data-del="${m.id}">刪除</button>
                  </td>
                </tr>`;
              }).join('') : `<tr><td colspan="${showPoints ? 10 : 9}"><div class="empty-state">查無會員資料</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderPetsTab() {
    const rows = petRows();
    return `
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>寵物名稱</th><th>類型</th><th>備註</th><th>飼主姓名</th><th>飼主電話</th><th></th></tr></thead>
            <tbody>
              ${rows.length ? rows.map(({ pet, member }) => `
                <tr>
                  <td>${Utils.escapeHtml(pet.name)}</td>
                  <td class="muted">${Utils.escapeHtml(pet.type || '')}</td>
                  <td class="muted">${Utils.escapeHtml(pet.note || '')}</td>
                  <td>${Utils.escapeHtml(member.name)}</td>
                  <td class="nowrap">${Utils.escapeHtml(member.phone || '')}</td>
                  <td><button class="btn sm" data-view-owner="${member.id}">查看會員</button></td>
                </tr>
              `).join('') : `<tr><td colspan="6"><div class="empty-state">查無寵物資料</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function render() {
    root().innerHTML = `
      <div class="toolbar">
        <div class="search-box" style="flex:1;max-width:360px;"><span>🔍</span><input type="text" id="f-search" placeholder="姓名 / 電話 / Email / 寵物名稱" value="${Utils.escapeHtml(search)}"></div>
        <div class="spacer"></div>
        <button class="btn primary" id="btn-add-member">＋ 新增會員</button>
      </div>
      <div class="tabs">
        <button class="tab-btn ${tab === 'members' ? 'active' : ''}" data-tab="members">會員查詢</button>
        <button class="tab-btn ${tab === 'pets' ? 'active' : ''}" data-tab="pets">寵物查詢</button>
        <button class="tab-btn ${tab === 'gifts' ? 'active' : ''}" data-tab="gifts">贈品兌換目錄</button>
      </div>
      ${tab === 'members' ? renderMembersTab() : tab === 'pets' ? renderPetsTab() : renderGiftsTab()}
    `;

    Utils.bindSearchInput('f-search', (v) => { search = v; render(); });
    document.getElementById('btn-add-member').addEventListener('click', () => openForm(null));
    root().querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));

    if (tab === 'members') {
      root().querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openForm(DB.state.members.find((m) => m.id === b.dataset.edit))));
      root().querySelectorAll('[data-detail]').forEach((b) => b.addEventListener('click', () => openDetail(DB.state.members.find((m) => m.id === b.dataset.detail))));
      root().querySelectorAll('[data-topup]').forEach((b) => b.addEventListener('click', () => openTopUp(DB.state.members.find((m) => m.id === b.dataset.topup))));
      root().querySelectorAll('[data-adjust-points]').forEach((b) => b.addEventListener('click', () => openAdjustPoints(DB.state.members.find((m) => m.id === b.dataset.adjustPoints))));
      root().querySelectorAll('[data-redeem-gift]').forEach((b) => b.addEventListener('click', () => openRedeemGift(DB.state.members.find((m) => m.id === b.dataset.redeemGift))));
      root().querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
        const m = DB.state.members.find((mm) => mm.id === b.dataset.del);
        if (!m) return;
        Utils.confirmModal(`確定要刪除會員「${Utils.escapeHtml(m.name)}」嗎？此操作不會刪除該會員過去的交易紀錄，但紀錄將不再顯示會員歸屬。${m.balance ? `此會員目前仍有儲值金餘額 ${Utils.money(m.balance)}，刪除後將無法查詢或使用。` : ''}`, () => {
          DB.state.members = DB.state.members.filter((mm) => mm.id !== m.id);
          DB.save();
          Utils.toast('已刪除會員', 'success');
          render();
        });
      }));
    } else if (tab === 'pets') {
      root().querySelectorAll('[data-view-owner]').forEach((b) => b.addEventListener('click', () => openForm(DB.state.members.find((m) => m.id === b.dataset.viewOwner))));
    } else {
      root().querySelectorAll('[data-new-gift]').forEach((b) => b.addEventListener('click', () => openGiftForm(null)));
      root().querySelectorAll('[data-edit-gift]').forEach((b) => b.addEventListener('click', () => openGiftForm(DB.state.loyaltyGifts.find((g) => g.id === b.dataset.editGift))));
      root().querySelectorAll('[data-del-gift]').forEach((b) => b.addEventListener('click', () => {
        const g = DB.state.loyaltyGifts.find((x) => x.id === b.dataset.delGift);
        Utils.confirmModal(`確定要刪除贈品「${Utils.escapeHtml(g.name)}」嗎？`, () => {
          DB.state.loyaltyGifts = DB.state.loyaltyGifts.filter((x) => x.id !== g.id);
          DB.save(); render(); Utils.toast('已刪除', 'success');
        });
      }));
    }
  }

  function renderGiftsTab() {
    const gifts = DB.state.loyaltyGifts;
    return `
      <div class="toolbar">
        <div class="spacer"></div>
        <button class="btn primary" data-new-gift>＋ 新增贈品</button>
      </div>
      <div class="card">
        <p class="muted small">此目錄供「會員管理 &gt; 兌換贈品」使用，會員可用點數兌換以下贈品（庫存留空＝不限量）。</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>贈品名稱</th><th class="text-right">所需點數</th><th class="text-right">庫存</th><th>狀態</th><th></th></tr></thead>
            <tbody>
              ${gifts.length ? gifts.map((g) => `
                <tr>
                  <td>${Utils.escapeHtml(g.name)}</td>
                  <td class="text-right">${g.pointsCost}</td>
                  <td class="text-right">${g.stock === null ? '不限量' : g.stock}</td>
                  <td>${g.enabled ? '<span class="badge green">啟用</span>' : '<span class="badge gray">停用</span>'}</td>
                  <td class="nowrap"><button class="btn sm" data-edit-gift="${g.id}">編輯</button><button class="btn sm danger" data-del-gift="${g.id}">刪除</button></td>
                </tr>
              `).join('') : `<tr><td colspan="5"><div class="empty-state">尚無贈品，點選右上角新增</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function openForm(member) {
    const isEdit = !!member;
    const draft = member
      ? { name: member.name, phone: member.phone || '', email: member.email || '', address: member.address || '', note: member.note || '' }
      : { name: '', phone: '', email: '', address: '', note: '' };
    let pets = member ? (member.pets || []).map((p) => ({ ...p })) : [];
    const balance = member ? (member.balance || 0) : 0;

    function petRowsHtml() {
      if (!pets.length) return `<div class="hint">尚未新增寵物</div>`;
      return pets.map((p, idx) => `
        <div class="flex gap-8" style="margin-bottom:8px;" data-pet-row="${idx}">
          <input type="text" class="pet-name" data-idx="${idx}" value="${Utils.escapeHtml(p.name)}" placeholder="寵物名稱" style="flex:1">
          <input type="text" class="pet-type" data-idx="${idx}" value="${Utils.escapeHtml(p.type || '')}" placeholder="類型（狗/貓...）" style="width:130px">
          <input type="text" class="pet-note" data-idx="${idx}" value="${Utils.escapeHtml(p.note || '')}" placeholder="備註" style="flex:1">
          <button class="icon-btn pet-rm" data-idx="${idx}">✕</button>
        </div>
      `).join('');
    }

    function bodyHtml() {
      return `
        <div class="modal-title">${isEdit ? '編輯' : '新增'}會員 <button class="icon-btn" id="modal-close">✕</button></div>
        <div class="form-grid">
          <div class="field"><label>姓名 *</label><input type="text" id="f-name" value="${Utils.escapeHtml(draft.name)}"></div>
          <div class="field"><label>電話</label><input type="text" id="f-phone" value="${Utils.escapeHtml(draft.phone)}"></div>
          <div class="field"><label>Email</label><input type="text" id="f-email" value="${Utils.escapeHtml(draft.email)}"></div>
          <div class="field"><label>地址</label><input type="text" id="f-address" value="${Utils.escapeHtml(draft.address)}"></div>
        </div>
        ${isEdit ? `<div class="hint" style="margin:-4px 0 10px;">儲值金餘額：${Utils.money(balance)}（請於會員列表使用「儲值」按鈕調整，以保留異動紀錄）</div>` : ''}
        <div class="field">
          <label>寵物<span class="hint">（可新增多隻）</span></label>
          <div id="pet-rows">${petRowsHtml()}</div>
          <button class="btn sm" id="btn-add-pet">＋ 新增寵物</button>
        </div>
        <div class="field"><label>備註</label><input type="text" id="f-note" value="${Utils.escapeHtml(draft.note)}"></div>
        <div class="modal-foot">
          <button class="btn" id="modal-cancel">取消</button>
          <button class="btn primary" id="btn-save-member">儲存</button>
        </div>
      `;
    }

    function captureCommon() {
      draft.name = document.getElementById('f-name').value;
      draft.phone = document.getElementById('f-phone').value;
      draft.email = document.getElementById('f-email').value;
      draft.address = document.getElementById('f-address').value;
      draft.note = document.getElementById('f-note').value;
    }

    function capturePets() {
      document.querySelectorAll('.pet-name').forEach((inp) => { pets[Number(inp.dataset.idx)].name = inp.value; });
      document.querySelectorAll('.pet-type').forEach((inp) => { pets[Number(inp.dataset.idx)].type = inp.value; });
      document.querySelectorAll('.pet-note').forEach((inp) => { pets[Number(inp.dataset.idx)].note = inp.value; });
    }

    function rerender() { Utils.openModal(bodyHtml(), { wide: true }); bind(); }

    function bind() {
      document.getElementById('modal-close').onclick = Utils.closeModal;
      document.getElementById('modal-cancel').onclick = Utils.closeModal;
      document.getElementById('btn-add-pet').onclick = () => {
        captureCommon(); capturePets();
        pets.push({ id: DB.uid('PET'), name: '', type: '', note: '' });
        rerender();
      };
      document.querySelectorAll('.pet-rm').forEach((b) => b.onclick = () => {
        captureCommon(); capturePets();
        pets.splice(Number(b.dataset.idx), 1);
        rerender();
      });
      let saved = false;
      document.getElementById('btn-save-member').onclick = (e) => {
        if (saved) return;
        captureCommon(); capturePets();
        const name = draft.name.trim();
        if (!name) { Utils.toast('請輸入姓名', 'error'); return; }
        const cleanPets = pets
          .map((p) => ({ id: p.id || DB.uid('PET'), name: (p.name || '').trim(), type: (p.type || '').trim(), note: (p.note || '').trim() }))
          .filter((p) => p.name);
        const data = { name, phone: draft.phone.trim(), email: draft.email.trim(), address: draft.address.trim(), note: draft.note.trim(), pets: cleanPets };
        saved = true;
        e.currentTarget.disabled = true;
        if (isEdit) Object.assign(member, data);
        else DB.state.members.push({ id: DB.uid('M'), balance: 0, ...data });
        DB.save();
        Utils.closeModal();
        Utils.toast('已儲存', 'success');
        render();
      };
    }

    rerender();
  }

  function openTopUp(member) {
    if (!member) return;
    Utils.openModal(`
      <div class="modal-title">會員儲值 - ${Utils.escapeHtml(member.name)} <button class="icon-btn" id="modal-close">✕</button></div>
      <div class="hint" style="margin-bottom:8px;">目前餘額：${Utils.money(member.balance || 0)}</div>
      <div class="field"><label>儲值金額 *</label><input type="number" id="f-amount" min="1" placeholder="例如：1000"></div>
      <div class="field"><label>備註</label><input type="text" id="f-note" placeholder="例如：現金加值"></div>
      <div class="modal-foot">
        <button class="btn" id="modal-cancel">取消</button>
        <button class="btn primary" id="btn-topup">確認儲值</button>
      </div>
    `);
    document.getElementById('modal-close').onclick = Utils.closeModal;
    document.getElementById('modal-cancel').onclick = Utils.closeModal;
    let saved = false;
    document.getElementById('btn-topup').onclick = (e) => {
      if (saved) return;
      const amount = Number(document.getElementById('f-amount').value);
      if (!amount || amount <= 0) { Utils.toast('請輸入正確的儲值金額（需大於 0）', 'error'); return; }
      saved = true;
      e.currentTarget.disabled = true;
      member.balance = Math.round(((member.balance || 0) + amount) * 100) / 100;
      DB.state.memberBalanceLogs.push({
        id: DB.uid('MBL'), memberId: member.id, type: '儲值', amount,
        balanceAfter: member.balance, note: document.getElementById('f-note').value.trim(),
        operator: DB.getCurrentUser().name, datetime: new Date().toISOString(),
      });
      DB.save();
      Utils.closeModal();
      Utils.toast('已儲值', 'success');
      render();
    };
  }

  function openAdjustPoints(member) {
    if (!member) return;
    Utils.openModal(`
      <div class="modal-title">調整點數 - ${Utils.escapeHtml(member.name)} <button class="icon-btn" id="modal-close">✕</button></div>
      <div class="hint" style="margin-bottom:8px;">目前點數：${member.points || 0}</div>
      <div class="field"><label>調整點數 *</label><input type="number" id="f-points" placeholder="正數＝增加，負數＝減少"></div>
      <div class="field"><label>備註 *</label><input type="text" id="f-note" placeholder="例如：活動加碼贈點、系統糾錯"></div>
      <div class="modal-foot">
        <button class="btn" id="modal-cancel">取消</button>
        <button class="btn primary" id="btn-adjust">確認調整</button>
      </div>
    `);
    document.getElementById('modal-close').onclick = Utils.closeModal;
    document.getElementById('modal-cancel').onclick = Utils.closeModal;
    let saved = false;
    document.getElementById('btn-adjust').onclick = (e) => {
      if (saved) return;
      const delta = Number(document.getElementById('f-points').value);
      if (!delta) { Utils.toast('請輸入不為 0 的點數', 'error'); return; }
      const note = document.getElementById('f-note').value.trim();
      if (!note) { Utils.toast('請填寫調整原因', 'error'); return; }
      saved = true;
      e.currentTarget.disabled = true;
      member.points = Math.max(0, Math.round((member.points || 0) + delta));
      DB.state.memberPointLogs.push({
        id: DB.uid('MPL'), memberId: member.id, type: '手動調整', points: delta,
        pointsAfter: member.points, note, operator: DB.getCurrentUser().name, datetime: new Date().toISOString(),
      });
      DB.save();
      Utils.closeModal();
      Utils.toast('已調整點數', 'success');
      render();
    };
  }

  function openRedeemGift(member) {
    if (!member) return;
    const gifts = DB.state.loyaltyGifts.filter((g) => g.enabled && (g.stock === null || g.stock > 0));
    Utils.openModal(`
      <div class="modal-title">兌換贈品 - ${Utils.escapeHtml(member.name)} <button class="icon-btn" id="modal-close">✕</button></div>
      <div class="hint" style="margin-bottom:8px;">目前點數：${member.points || 0}</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>贈品名稱</th><th class="text-right">所需點數</th><th></th></tr></thead>
          <tbody>
            ${gifts.length ? gifts.map((g) => `
              <tr>
                <td>${Utils.escapeHtml(g.name)}</td>
                <td class="text-right">${g.pointsCost}</td>
                <td><button class="btn sm" data-pick-gift="${g.id}" ${(member.points || 0) < g.pointsCost ? 'disabled title="點數不足"' : ''}>兌換</button></td>
              </tr>
            `).join('') : `<tr><td colspan="3"><div class="empty-state">目前沒有可兌換的贈品</div></td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="modal-foot"><button class="btn" id="modal-cancel">關閉</button></div>
    `);
    document.getElementById('modal-close').onclick = Utils.closeModal;
    document.getElementById('modal-cancel').onclick = Utils.closeModal;
    document.querySelectorAll('[data-pick-gift]').forEach((b) => {
      b.onclick = () => {
        if (b.disabled) return;
        const gift = DB.state.loyaltyGifts.find((g) => g.id === b.dataset.pickGift);
        Utils.confirmModal(`確定要用 ${gift.pointsCost} 點為「${Utils.escapeHtml(member.name)}」兌換「${Utils.escapeHtml(gift.name)}」嗎？`, () => {
          // 注意：confirmModal 為非同步，b 已可能失效，改用閉包捕捉的 gift/member 物件直接操作。
          if ((member.points || 0) < gift.pointsCost) { Utils.toast('點數不足', 'error'); return; }
          if (gift.stock !== null && gift.stock <= 0) { Utils.toast('此贈品已無庫存', 'error'); return; }
          member.points = Math.max(0, (member.points || 0) - gift.pointsCost);
          if (gift.stock !== null) gift.stock -= 1;
          DB.state.memberPointLogs.push({
            id: DB.uid('MPL'), memberId: member.id, type: '兌換贈品', points: -gift.pointsCost,
            pointsAfter: member.points, note: gift.name, operator: DB.getCurrentUser().name, datetime: new Date().toISOString(),
          });
          DB.save();
          Utils.closeModal();
          Utils.toast(`已兌換「${gift.name}」`, 'success');
          render();
        });
      };
    });
  }

  function openGiftForm(gift) {
    const isEdit = !!gift;
    gift = gift || { name: '', pointsCost: 100, stock: null, enabled: true };
    Utils.openModal(`
      <div class="modal-title">${isEdit ? '編輯' : '新增'}贈品 <button class="icon-btn" id="modal-close">✕</button></div>
      <div class="field"><label>贈品名稱 *</label><input type="text" id="f-name" value="${Utils.escapeHtml(gift.name)}"></div>
      <div class="form-grid">
        <div class="field"><label>所需點數 *</label><input type="number" id="f-cost" min="1" value="${gift.pointsCost}"></div>
        <div class="field"><label>庫存（留空＝不限量）</label><input type="number" id="f-stock" min="0" value="${gift.stock === null ? '' : gift.stock}"></div>
      </div>
      <label class="checkbox-row"><input type="checkbox" id="f-enabled" ${gift.enabled ? 'checked' : ''}> 啟用</label>
      <div class="modal-foot">
        <button class="btn" id="modal-cancel">取消</button>
        <button class="btn primary" id="btn-save-gift">儲存</button>
      </div>
    `);
    document.getElementById('modal-close').onclick = Utils.closeModal;
    document.getElementById('modal-cancel').onclick = Utils.closeModal;
    let saved = false;
    document.getElementById('btn-save-gift').onclick = (e) => {
      if (saved) return;
      const name = document.getElementById('f-name').value.trim();
      if (!name) { Utils.toast('請輸入贈品名稱', 'error'); return; }
      const pointsCost = Number(document.getElementById('f-cost').value) || 0;
      if (pointsCost <= 0) { Utils.toast('所需點數需大於 0', 'error'); return; }
      const stockRaw = document.getElementById('f-stock').value;
      const data = {
        name, pointsCost,
        stock: stockRaw === '' ? null : Math.max(0, Number(stockRaw) || 0),
        enabled: document.getElementById('f-enabled').checked,
      };
      saved = true;
      e.currentTarget.disabled = true;
      if (isEdit) Object.assign(gift, data);
      else DB.state.loyaltyGifts.push({ id: DB.uid('GIFT'), ...data });
      DB.save();
      Utils.closeModal();
      Utils.toast('已儲存', 'success');
      render();
    };
  }

  function openDetail(member) {
    if (!member) return;
    const orders = ordersOf(member.id);
    const st = statsOf(member.id);
    const balLogs = balanceLogsOf(member.id);
    const showPoints = loyaltyEnabled();
    const pointLogs = showPoints ? pointLogsOf(member.id) : [];
    Utils.openModal(`
      <div class="modal-title">${Utils.escapeHtml(member.name)} 的消費紀錄 <button class="icon-btn" id="modal-close">✕</button></div>
      <div class="flex gap-8" style="margin-bottom:10px;"><span class="muted small">${Utils.escapeHtml(member.phone || '')}${petsLabel(member) ? ` · ${Utils.escapeHtml(petsLabel(member))}` : ''}</span></div>
      <div class="grid grid-4" style="margin-bottom:12px;">
        <div class="stat-card"><div class="label">有效消費次數</div><div class="value">${st.count}</div></div>
        <div class="stat-card"><div class="label">累積消費金額</div><div class="value up">${Utils.money(st.total)}</div></div>
        <div class="stat-card"><div class="label">目前儲值金餘額</div><div class="value">${Utils.money(member.balance || 0)}</div></div>
        ${showPoints ? `<div class="stat-card"><div class="label">目前點數</div><div class="value">${member.points || 0}</div></div>` : ''}
      </div>
      <div class="card-title" style="margin-top:4px;">消費訂單</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>訂單編號</th><th>時間</th><th>品項</th><th class="text-right">總計</th><th>狀態</th></tr></thead>
          <tbody>
            ${orders.length ? orders.map((o) => `
              <tr>
                <td class="nowrap">${o.no}</td>
                <td class="nowrap">${Utils.fmtDateTime(o.datetime)}</td>
                <td>${Utils.escapeHtml(o.items.map((i) => i.name).join('、'))}</td>
                <td class="text-right">${Utils.money(o.total)}</td>
                <td>${o.status}</td>
              </tr>
            `).join('') : `<tr><td colspan="5"><div class="empty-state">此會員尚無消費紀錄</div></td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="card-title" style="margin-top:16px;">儲值金異動紀錄</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>時間</th><th>類型</th><th class="text-right">金額</th><th class="text-right">異動後餘額</th><th>操作者</th><th>備註</th></tr></thead>
          <tbody>
            ${balLogs.length ? balLogs.map((l) => `
              <tr>
                <td class="nowrap">${Utils.fmtDateTime(l.datetime)}</td>
                <td><span class="badge ${l.amount >= 0 ? 'green' : 'red'}">${l.type}</span></td>
                <td class="text-right">${l.amount >= 0 ? '+' : '-'}${Utils.money(Math.abs(l.amount))}</td>
                <td class="text-right">${Utils.money(l.balanceAfter)}</td>
                <td class="muted">${Utils.escapeHtml(l.operator || '')}</td>
                <td class="muted">${Utils.escapeHtml(l.note || '')}</td>
              </tr>
            `).join('') : `<tr><td colspan="6"><div class="empty-state">尚無儲值金異動紀錄</div></td></tr>`}
          </tbody>
        </table>
      </div>
      ${showPoints ? `
      <div class="card-title" style="margin-top:16px;">點數異動紀錄</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>時間</th><th>類型</th><th class="text-right">點數</th><th class="text-right">異動後點數</th><th>操作者</th><th>備註</th></tr></thead>
          <tbody>
            ${pointLogs.length ? pointLogs.map((l) => `
              <tr>
                <td class="nowrap">${Utils.fmtDateTime(l.datetime)}</td>
                <td><span class="badge ${l.points >= 0 ? 'green' : 'red'}">${l.type}</span></td>
                <td class="text-right">${l.points >= 0 ? '+' : ''}${l.points}</td>
                <td class="text-right">${l.pointsAfter}</td>
                <td class="muted">${Utils.escapeHtml(l.operator || '')}</td>
                <td class="muted">${Utils.escapeHtml(l.note || '')}</td>
              </tr>
            `).join('') : `<tr><td colspan="6"><div class="empty-state">尚無點數異動紀錄</div></td></tr>`}
          </tbody>
        </table>
      </div>
      ` : ''}
      <div class="modal-foot"><button class="btn primary" id="modal-close2">關閉</button></div>
    `, { wide: true });
    document.getElementById('modal-close').onclick = Utils.closeModal;
    document.getElementById('modal-close2').onclick = Utils.closeModal;
  }

  return { render };
})();
