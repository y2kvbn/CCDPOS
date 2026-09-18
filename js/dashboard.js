/* ========================================================================
 * dashboard.js - 營運總覽
 * ======================================================================== */
const Dashboard = (() => {
  const CATEGORY_BADGE = { 美容: 'orange', 寄養: 'teal', 安親: 'yellow', 課程: 'purple' };
  const EXPIRY_WARN_DAYS = 30;

  function root() { return document.getElementById('view-dashboard'); }

  function todayOrders() {
    const t = DB.todayStr();
    return DB.state.posOrders.filter((o) => o.datetime.slice(0, 10) === t && o.status === '完成');
  }

  function expiringBatches() {
    const today = DB.todayStr();
    const warnDate = new Date(Date.now() + EXPIRY_WARN_DAYS * 86400000).toISOString().slice(0, 10);
    const rows = [];
    DB.state.products.forEach((p) => {
      (p.batches || []).forEach((b) => {
        if (!b.expiryDate || b.qty <= 0) return;
        if (b.expiryDate <= warnDate) {
          rows.push({ productName: p.name, unit: p.unit, ...b, expired: b.expiryDate < today });
        }
      });
    });
    return rows.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  }

  function render() {
    const s = DB.state;
    const tOrders = todayOrders();
    const todayRevenue = tOrders.reduce((sum, o) => sum + o.total, 0);
    const pendingReservations = s.reservations.filter((g) => g.status === '待結帳');
    const pendingEnrollments = s.enrollments.filter((e) => e.status === '待結帳');
    const lowStock = s.products.filter((p) => p.stock <= p.safetyStock);
    const pendingPO = s.purchases.filter((p) => p.status !== '已入庫');
    const recentOrders = [...s.posOrders].sort((a, b) => b.datetime.localeCompare(a.datetime)).slice(0, 6);
    const expiring = expiringBatches();

    const pendingItems = [
      ...pendingReservations.map((o) => ({ kind: 'res', id: o.id, category: o.category, title: `${o.petName} / ${o.ownerName}`, meta: `${o.no}` })),
      ...pendingEnrollments.map((e) => {
        const c = s.courses.find((x) => x.id === e.courseId);
        return { kind: 'enroll', id: e.id, category: '課程', title: `${e.studentName}${e.petName ? ' / ' + e.petName : ''}`, meta: `${e.no} · ${c ? c.name : ''}` };
      }),
    ];

    root().innerHTML = `
      <div class="grid grid-4">
        <div class="stat-card"><div class="label">今日營收</div><div class="value up">${Utils.money(todayRevenue)}</div><div class="hint">${tOrders.length} 筆交易</div></div>
        <div class="stat-card"><div class="label">待結帳項目</div><div class="value">${pendingItems.length}</div><div class="hint">美容 / 寄養 / 安親 / 課程</div></div>
        <div class="stat-card"><div class="label">低庫存商品</div><div class="value" style="color:var(--warn)">${lowStock.length}</div><div class="hint">需注意補貨</div></div>
        <div class="stat-card"><div class="label">即將到期批號</div><div class="value" style="color:${expiring.some((e) => e.expired) ? 'var(--danger)' : 'var(--warn)'}">${expiring.length}</div><div class="hint">${EXPIRY_WARN_DAYS} 天內 / 已過期</div></div>
      </div>

      ${expiring.length ? `
      <div class="card" style="margin-top:16px;border-color:var(--warn);">
        <div class="card-title">⚠️ 商品效期提醒</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>商品名稱</th><th>批號/備註</th><th class="text-right">數量</th><th>到期日</th><th>狀態</th></tr></thead>
            <tbody>
              ${expiring.slice(0, 8).map((b) => `
                <tr>
                  <td>${Utils.escapeHtml(b.productName)}</td>
                  <td class="muted">${Utils.escapeHtml(b.note || '-')}</td>
                  <td class="text-right">${b.qty} ${Utils.escapeHtml(b.unit || '')}</td>
                  <td class="nowrap">${b.expiryDate}</td>
                  <td>${b.expired ? '<span class="badge red">已過期</span>' : '<span class="badge yellow">即將到期</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}

      <div class="grid grid-2" style="margin-top:16px;align-items:start;">
        <div class="card">
          <div class="card-title">待結帳項目</div>
          ${pendingItems.length ? `
            <div class="pending-list">
              ${pendingItems.slice(0, 6).map((item) => `
                <div class="pending-card">
                  <span class="badge ${CATEGORY_BADGE[item.category] || 'gray'}">${item.category}</span>
                  <div class="pc-info">
                    <div class="pc-pet">${Utils.escapeHtml(item.title)}</div>
                    <div class="pc-meta">${Utils.escapeHtml(item.meta)}</div>
                  </div>
                  <button class="btn sm primary" data-kind="${item.kind}" data-id="${item.id}">轉POS結帳</button>
                </div>
              `).join('')}
            </div>
          ` : `<div class="empty-state">目前沒有待結帳項目 🎉</div>`}
        </div>

        <div class="card">
          <div class="card-title">低庫存提醒</div>
          ${lowStock.length ? `
            <div class="table-wrap">
              <table>
                <thead><tr><th>商品</th><th class="text-right">庫存</th><th class="text-right">安全庫存</th></tr></thead>
                <tbody>
                  ${lowStock.slice(0, 8).map((p) => `<tr><td>${Utils.escapeHtml(p.name)}</td><td class="text-right">${p.stock}</td><td class="text-right muted">${p.safetyStock}</td></tr>`).join('')}
                </tbody>
              </table>
            </div>
          ` : `<div class="empty-state">庫存量都正常 👍</div>`}
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="card-title">最近交易紀錄</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>訂單編號</th><th>時間</th><th>品項</th><th class="text-right">金額</th><th>狀態</th></tr></thead>
            <tbody>
              ${recentOrders.length ? recentOrders.map((o) => `
                <tr>
                  <td class="nowrap">${o.no}</td>
                  <td class="nowrap">${Utils.fmtDateTime(o.datetime)}</td>
                  <td>${Utils.escapeHtml(o.items.map((i) => i.name).join('、'))}</td>
                  <td class="text-right">${Utils.money(o.total)}</td>
                  <td>${o.status === '完成' ? '<span class="badge green">完成</span>' : o.status === '已退款' ? '<span class="badge red">已退款</span>' : '<span class="badge gray">已作廢</span>'}</td>
                </tr>
              `).join('') : `<tr><td colspan="5"><div class="empty-state">尚無交易紀錄</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;

    root().querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.kind === 'res') POS.loadReservation(b.dataset.id);
      else POS.loadEnrollment(b.dataset.id);
    }));
  }

  return { render };
})();
