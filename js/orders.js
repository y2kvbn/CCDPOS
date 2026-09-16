/* ========================================================================
 * orders.js - 交易紀錄查詢 / 退款 / 作廢
 * ======================================================================== */
const Orders = (() => {
  let dateFrom = '';
  let dateTo = '';
  let search = '';
  let statusFilter = 'all';
  let page = 1;
  const PER_PAGE = 50;

  function root() { return document.getElementById('view-orders'); }

  function statusBadge(st) {
    const map = { 完成: 'green', 已退款: 'red', 已作廢: 'gray' };
    return `<span class="badge ${map[st] || 'gray'}">${st}</span>`;
  }

  /** BUG-008：起日晚於迄日時視為無效區間 */
  function dateRangeInvalid() {
    return !!(dateFrom && dateTo && dateFrom > dateTo);
  }

  function list() {
    if (dateRangeInvalid()) return [];
    let arr = [...DB.state.posOrders].sort((a, b) => b.datetime.localeCompare(a.datetime));
    if (dateFrom) arr = arr.filter((o) => o.datetime.slice(0, 10) >= dateFrom);
    if (dateTo) arr = arr.filter((o) => o.datetime.slice(0, 10) <= dateTo);
    if (statusFilter !== 'all') arr = arr.filter((o) => o.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter((o) => o.no.toLowerCase().includes(q) || o.items.some((it) => it.name.toLowerCase().includes(q)));
    }
    return arr;
  }

  // 狀態機：只有「完成」狀態的訂單可以進入退款/作廢流程；處理中狀態可避免同一訂單被重複觸發。
  const REVERSE_PROCESSING_STATUS = { 已退款: '退款處理中', 已作廢: '作廢處理中' };

  function reverseOrder(order, newStatus) {
    // 第二層防護：即使按鈕鎖定被繞過，這裡再次確認訂單狀態，只有「完成」能被退款/作廢，
    // 避免同一筆訂單的庫存被重複加回。
    if (order.status !== '完成') {
      Utils.toast(`此訂單目前狀態為「${order.status}」，無法執行此操作`, 'error');
      return false;
    }

    const processingStatus = REVERSE_PROCESSING_STATUS[newStatus];
    order.status = processingStatus; // 先進入處理中狀態，避免重入
    try {
      order.items.forEach((it) => {
        if (it.type === 'product') {
          const p = DB.state.products.find((pp) => pp.id === it.refId);
          if (p) {
            p.stock += it.qty;
            DB.state.inventoryLogs.push({ id: DB.uid('LOG'), date: DB.todayStr(), productId: p.id, type: newStatus === '已退款' ? '退貨' : '作廢還原', qty: it.qty, note: order.no, stockAfter: p.stock, operator: DB.getCurrentUser().name });
          }
        }
      });
      order.status = newStatus;
      order.reversedBy = DB.getCurrentUser().name; // 記錄操作者，供事後稽核（AUTH-DESIGN.md 第一階段）
      order.reversedAt = new Date().toISOString();
      if (order.reservationId) {
        const res = DB.state.reservations.find((g) => g.id === order.reservationId);
        if (res) res.status = '待結帳';
      }
      if (order.enrollmentId) {
        const enrollment = DB.state.enrollments.find((e) => e.id === order.enrollmentId);
        if (enrollment) enrollment.status = '待結帳';
      }
      // 若此訂單曾以儲值金付款，退款/作廢時將金額退回會員儲值金餘額（會員若已被刪除則略過，不報錯）。
      const balancePaid = (order.payments || []).filter((p) => p.method === '儲值金').reduce((s, p) => s + p.amount, 0);
      if (balancePaid > 0 && order.memberId) {
        const member = DB.state.members.find((m) => m.id === order.memberId);
        if (member) {
          member.balance = Math.round(((member.balance || 0) + balancePaid) * 100) / 100;
          DB.state.memberBalanceLogs.push({
            id: DB.uid('MBL'), memberId: member.id, type: newStatus === '已退款' ? '退款退回' : '作廢退回', amount: balancePaid,
            balanceAfter: member.balance, note: order.no, operator: DB.getCurrentUser().name, datetime: new Date().toISOString(),
          });
        }
      }
      DB.save();
      return true;
    } catch (err) {
      order.status = '完成'; // 執行中出錯則還原狀態，避免卡在處理中
      DB.save();
      throw err;
    }
  }

  function openDetail(order) {
    const lines = order.items.map((it) => `<tr><td>${Utils.escapeHtml(it.name)}</td><td class="text-center">${it.qty}</td><td class="text-right">${Utils.money(it.price)}</td><td class="text-right">${Utils.money(it.price * it.qty)}</td></tr>`).join('');
    const pay = order.payments.map((p) => `<div class="sum-row"><span>${p.method}</span><span>${Utils.money(p.amount)}</span></div>`).join('');
    const member = order.memberId ? DB.state.members.find((m) => m.id === order.memberId) : null;
    Utils.openModal(`
      <div class="modal-title">訂單明細 ${order.no} <button class="icon-btn" id="modal-close">✕</button></div>
      <div class="flex gap-8" style="margin-bottom:10px;">${statusBadge(order.status)} <span class="muted small">${Utils.fmtDateTime(order.datetime)} · 收銀 ${Utils.escapeHtml(order.cashier || '')}${member ? ` · 會員 ${Utils.escapeHtml(member.name)}` : ''}${order.reversedBy ? ` · ${order.status}操作者 ${Utils.escapeHtml(order.reversedBy)}（${Utils.fmtDateTime(order.reversedAt)}）` : ''}</span></div>
      <div class="table-wrap"><table><thead><tr><th>品項</th><th class="text-center">數量</th><th class="text-right">單價</th><th class="text-right">小計</th></tr></thead><tbody>${lines}</tbody></table></div>
      <div class="divider"></div>
      <div class="sum-row"><span>小計</span><span>${Utils.money(order.subtotal)}</span></div>
      <div class="sum-row"><span>折扣${order.discountPercent ? `（${order.discountPercent}%）` : ''}</span><span>-${Utils.money(order.discount)}</span></div>
      ${order.discountReason ? `<div class="small muted">折扣原因：${Utils.escapeHtml(order.discountReason)}${order.discountApprovedBy ? ` · 管理員授權：${Utils.escapeHtml(order.discountApprovedBy)}` : ''}</div>` : ''}
      <div class="sum-row total"><span>總計</span><span>${Utils.money(order.total)}</span></div>
      <div class="divider"></div>
      ${pay}
      <div class="modal-foot">
        ${order.status === '完成' ? `<button class="btn danger" id="btn-void">作廢</button><button class="btn danger" id="btn-refund">退款</button>` : ''}
        <button class="btn primary" id="modal-close2">關閉</button>
      </div>
    `, { wide: true });
    document.getElementById('modal-close').onclick = Utils.closeModal;
    document.getElementById('modal-close2').onclick = Utils.closeModal;
    const refundBtn = document.getElementById('btn-refund');
    const voidBtn = document.getElementById('btn-void');
    if (refundBtn) refundBtn.onclick = (e) => {
      if (refundBtn.disabled || voidBtn.disabled) return; // 第一層防護：處理中忽略後續點擊
      Utils.confirmModal('確定要退款此訂單嗎？商品庫存將會回補。', () => {
        refundBtn.disabled = true;
        voidBtn.disabled = true; // 兩個按鈕一起鎖定，避免退款中途又點作廢
        const ok = reverseOrder(order, '已退款');
        if (ok) { Utils.closeModal(); Utils.toast('已完成退款', 'success'); render(); }
        else { refundBtn.disabled = false; voidBtn.disabled = false; }
      });
    };
    if (voidBtn) voidBtn.onclick = (e) => {
      if (refundBtn.disabled || voidBtn.disabled) return;
      Utils.confirmModal('確定要作廢此訂單嗎？商品庫存將會回補。', () => {
        refundBtn.disabled = true;
        voidBtn.disabled = true;
        const ok = reverseOrder(order, '已作廢');
        if (ok) { Utils.closeModal(); Utils.toast('已作廢', 'success'); render(); }
        else { refundBtn.disabled = false; voidBtn.disabled = false; }
      });
    };
  }

  function render() {
    const arr = list();
    const sumTotal = arr.filter((o) => o.status === '完成').reduce((s, o) => s + o.total, 0);
    // BUG-007：統計數字（篩選結果筆數/有效營收合計）用完整的 arr，表格只顯示當前頁 pageItems。
    const { pageItems, totalPages, page: clampedPage } = Utils.paginate(arr, page, PER_PAGE);
    page = clampedPage;
    root().innerHTML = `
      <div class="toolbar">
        <div class="field" style="margin:0;"><label>起</label><input type="date" id="f-from" value="${dateFrom}"></div>
        <div class="field" style="margin:0;"><label>迄</label><input type="date" id="f-to" value="${dateTo}"></div>
        <div class="field" style="margin:0;"><label>狀態</label>
          <select id="f-status">
            ${['all', '完成', '已退款', '已作廢'].map((st) => `<option value="${st}" ${statusFilter === st ? 'selected' : ''}>${st === 'all' ? '全部' : st}</option>`).join('')}
          </select>
        </div>
        <div class="search-box" style="margin-top:18px;"><span>🔍</span><input type="text" id="f-search" placeholder="訂單編號 / 品項名稱" value="${Utils.escapeHtml(search)}"></div>
        <div class="spacer"></div>
        <button class="btn" id="btn-export" style="margin-top:18px;">匯出 CSV</button>
      </div>
      ${dateRangeInvalid() ? `
        <div class="card" style="border-color:var(--danger);">
          <div class="empty-state"><div class="icon">⚠️</div>日期區間不正確：「起」（${dateFrom}）晚於「迄」（${dateTo}），請重新選擇日期</div>
        </div>
      ` : `
      <div class="grid grid-4" style="margin-bottom:16px;">
        <div class="stat-card"><div class="label">篩選結果筆數</div><div class="value">${arr.length}</div></div>
        <div class="stat-card"><div class="label">有效營收合計</div><div class="value up">${Utils.money(sumTotal)}</div></div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>訂單編號</th><th>時間</th><th>品項</th><th class="text-right">總計</th><th>狀態</th><th>收銀</th><th></th></tr></thead>
            <tbody>
              ${pageItems.length ? pageItems.map((o) => `
                <tr>
                  <td class="nowrap">${o.no}</td>
                  <td class="nowrap">${Utils.fmtDateTime(o.datetime)}</td>
                  <td>${Utils.escapeHtml(o.items.map((i) => i.name).join('、'))}</td>
                  <td class="text-right">${Utils.money(o.total)}</td>
                  <td>${statusBadge(o.status)}</td>
                  <td>${Utils.escapeHtml(o.cashier || '')}</td>
                  <td><button class="btn sm" data-view="${o.id}">明細</button></td>
                </tr>
              `).join('') : `<tr><td colspan="7"><div class="empty-state">查無交易紀錄</div></td></tr>`}
            </tbody>
          </table>
        </div>
        ${Utils.paginationHtml(page, totalPages)}
      </div>
      `}
    `;

    document.getElementById('f-from').addEventListener('change', (e) => { dateFrom = e.target.value; page = 1; render(); });
    document.getElementById('f-to').addEventListener('change', (e) => { dateTo = e.target.value; page = 1; render(); });
    document.getElementById('f-status').addEventListener('change', (e) => { statusFilter = e.target.value; page = 1; render(); });
    Utils.bindSearchInput('f-search', (v) => { search = v; page = 1; render(); });
    document.getElementById('btn-export').addEventListener('click', () => {
      const rows = [['訂單編號', '時間', '品項', '小計', '折扣', '總計', '狀態', '收銀']];
      arr.forEach((o) => rows.push([o.no, Utils.fmtDateTime(o.datetime), o.items.map((i) => i.name).join('、'), o.subtotal, o.discount, o.total, o.status, o.cashier || '']));
      Utils.downloadCSV('交易紀錄.csv', rows);
    });
    root().querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
      openDetail(DB.state.posOrders.find((o) => o.id === b.dataset.view));
    }));
    const pager = root().querySelector('.pagination');
    if (pager) pager.addEventListener('click', (e) => {
      if (e.target.dataset.pg === 'prev') { page -= 1; render(); }
      else if (e.target.dataset.pg === 'next') { page += 1; render(); }
    });
  }

  return { render };
})();
