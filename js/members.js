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

  function renderMembersTab() {
    const arr = list();
    return `
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>會員姓名</th><th>電話</th><th>Email</th><th>地址</th><th>寵物</th><th class="text-right">儲值金</th><th class="text-right">消費次數</th><th class="text-right">累積消費</th><th></th></tr></thead>
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
                  <td class="text-right">${st.count}</td>
                  <td class="text-right">${Utils.money(st.total)}</td>
                  <td class="nowrap">
                    <button class="btn sm" data-topup="${m.id}">儲值</button>
                    <button class="btn sm" data-detail="${m.id}">消費紀錄</button>
                    <button class="btn sm" data-edit="${m.id}">編輯</button>
                    <button class="btn sm danger" data-del="${m.id}">刪除</button>
                  </td>
                </tr>`;
              }).join('') : `<tr><td colspan="9"><div class="empty-state">查無會員資料</div></td></tr>`}
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
      </div>
      ${tab === 'members' ? renderMembersTab() : renderPetsTab()}
    `;

    Utils.bindSearchInput('f-search', (v) => { search = v; render(); });
    document.getElementById('btn-add-member').addEventListener('click', () => openForm(null));
    root().querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));

    if (tab === 'members') {
      root().querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openForm(DB.state.members.find((m) => m.id === b.dataset.edit))));
      root().querySelectorAll('[data-detail]').forEach((b) => b.addEventListener('click', () => openDetail(DB.state.members.find((m) => m.id === b.dataset.detail))));
      root().querySelectorAll('[data-topup]').forEach((b) => b.addEventListener('click', () => openTopUp(DB.state.members.find((m) => m.id === b.dataset.topup))));
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
    } else {
      root().querySelectorAll('[data-view-owner]').forEach((b) => b.addEventListener('click', () => openForm(DB.state.members.find((m) => m.id === b.dataset.viewOwner))));
    }
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

  function openDetail(member) {
    if (!member) return;
    const orders = ordersOf(member.id);
    const st = statsOf(member.id);
    const balLogs = balanceLogsOf(member.id);
    Utils.openModal(`
      <div class="modal-title">${Utils.escapeHtml(member.name)} 的消費紀錄 <button class="icon-btn" id="modal-close">✕</button></div>
      <div class="flex gap-8" style="margin-bottom:10px;"><span class="muted small">${Utils.escapeHtml(member.phone || '')}${petsLabel(member) ? ` · ${Utils.escapeHtml(petsLabel(member))}` : ''}</span></div>
      <div class="grid grid-4" style="margin-bottom:12px;">
        <div class="stat-card"><div class="label">有效消費次數</div><div class="value">${st.count}</div></div>
        <div class="stat-card"><div class="label">累積消費金額</div><div class="value up">${Utils.money(st.total)}</div></div>
        <div class="stat-card"><div class="label">目前儲值金餘額</div><div class="value">${Utils.money(member.balance || 0)}</div></div>
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
      <div class="modal-foot"><button class="btn primary" id="modal-close2">關閉</button></div>
    `, { wide: true });
    document.getElementById('modal-close').onclick = Utils.closeModal;
    document.getElementById('modal-close2').onclick = Utils.closeModal;
  }

  return { render };
})();
