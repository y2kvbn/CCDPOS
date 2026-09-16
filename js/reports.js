/* ========================================================================
 * reports.js - 報表（營收 / 商品銷售 / 美容服務 / 成本毛利）
 * ======================================================================== */
const Reports = (() => {
  let dateFrom = '';
  let dateTo = '';

  function root() { return document.getElementById('view-reports'); }

  function defaultRange() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    dateFrom = first.toISOString().slice(0, 10);
    dateTo = DB.todayStr();
  }

  function ordersInRange() {
    return DB.state.posOrders.filter((o) => {
      if (o.status !== '完成') return false;
      const d = o.datetime.slice(0, 10);
      return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
    });
  }

  function buildItemStats(orders, type) {
    const map = new Map();
    orders.forEach((o) => {
      o.items.filter((it) => it.type === type).forEach((it) => {
        const key = it.refId;
        if (!map.has(key)) map.set(key, { name: it.name, qty: 0, revenue: 0, cost: 0 });
        const row = map.get(key);
        row.qty += it.qty;
        row.revenue += it.price * it.qty;
        row.cost += (it.cost || 0) * it.qty;
      });
    });
    return Array.from(map.values()).map((r) => ({ ...r, profit: r.revenue - r.cost, margin: r.revenue ? ((r.revenue - r.cost) / r.revenue * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  function dailySeries(orders) {
    const map = new Map();
    orders.forEach((o) => {
      const d = o.datetime.slice(0, 10);
      map.set(d, (map.get(d) || 0) + o.total);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }

  function chartHtml(series) {
    if (!series.length) return `<div class="empty-state">此區間尚無營收資料</div>`;
    const max = Math.max(...series.map((s) => s[1]), 1);
    return `
      <div style="display:flex;align-items:flex-end;gap:6px;height:160px;padding-top:10px;">
        ${series.map(([d, v]) => `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;">
            <div class="small muted" style="margin-bottom:4px;">${v ? Utils.money(v) : ''}</div>
            <div style="width:100%;max-width:34px;background:var(--brand);border-radius:6px 6px 0 0;height:${Math.max(4, v / max * 120)}px;" title="${d}: ${Utils.money(v)}"></div>
            <div class="small muted" style="margin-top:6px;white-space:nowrap;">${d.slice(5)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /** BUG-008：起日晚於迄日時視為無效區間，不應顯示容易誤解的 $0 報表 */
  function dateRangeInvalid() {
    return !!(dateFrom && dateTo && dateFrom > dateTo);
  }

  function render() {
    if (!dateFrom && !dateTo) defaultRange();

    if (dateRangeInvalid()) {
      root().innerHTML = `
        <div class="toolbar">
          <div class="field" style="margin:0;"><label>起</label><input type="date" id="f-report-from" value="${dateFrom}"></div>
          <div class="field" style="margin:0;"><label>迄</label><input type="date" id="f-report-to" value="${dateTo}"></div>
          <div class="btn-row" style="margin-top:18px;">
            <button class="btn sm" data-range="today">今日</button>
            <button class="btn sm" data-range="week">近7天</button>
            <button class="btn sm" data-range="month">本月</button>
          </div>
        </div>
        <div class="card" style="border-color:var(--danger);">
          <div class="empty-state"><div class="icon">⚠️</div>日期區間不正確：「起」（${dateFrom}）晚於「迄」（${dateTo}），請重新選擇日期</div>
        </div>
      `;
      document.getElementById('f-report-from').addEventListener('change', (e) => { dateFrom = e.target.value; render(); });
      document.getElementById('f-report-to').addEventListener('change', (e) => { dateTo = e.target.value; render(); });
      root().querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
        const today = new Date();
        if (b.dataset.range === 'today') { dateFrom = dateTo = DB.todayStr(); }
        else if (b.dataset.range === 'week') { dateFrom = new Date(today - 6 * 86400000).toISOString().slice(0, 10); dateTo = DB.todayStr(); }
        else { const first = new Date(today.getFullYear(), today.getMonth(), 1); dateFrom = first.toISOString().slice(0, 10); dateTo = DB.todayStr(); }
        render();
      }));
      return;
    }

    const orders = ordersInRange();
    const productStats = buildItemStats(orders, 'product');
    const serviceStats = buildItemStats(orders, 'service');
    const courseStats = buildItemStats(orders, 'course');
    const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
    const totalCost = [...productStats, ...serviceStats, ...courseStats].reduce((s, r) => s + r.cost, 0);
    const totalProfit = totalRevenue - totalCost;
    const productRevenue = productStats.reduce((s, r) => s + r.revenue, 0);
    const serviceRevenue = serviceStats.reduce((s, r) => s + r.revenue, 0);
    const courseRevenue = courseStats.reduce((s, r) => s + r.revenue, 0);

    root().innerHTML = `
      <div class="toolbar">
        <div class="field" style="margin:0;"><label>起</label><input type="date" id="f-report-from" value="${dateFrom}"></div>
        <div class="field" style="margin:0;"><label>迄</label><input type="date" id="f-report-to" value="${dateTo}"></div>
        <div class="btn-row" style="margin-top:18px;">
          <button class="btn sm" data-range="today">今日</button>
          <button class="btn sm" data-range="week">近7天</button>
          <button class="btn sm" data-range="month">本月</button>
        </div>
        <div class="spacer"></div>
        <button class="btn" id="btn-export-report" style="margin-top:18px;">匯出商品銷售 CSV</button>
      </div>

      <div class="grid grid-4">
        <div class="stat-card"><div class="label">總營收</div><div class="value up">${Utils.money(totalRevenue)}</div><div class="hint">${orders.length} 筆訂單</div></div>
        <div class="stat-card"><div class="label">商品銷售額</div><div class="value">${Utils.money(productRevenue)}</div></div>
        <div class="stat-card"><div class="label">服務額（美容/寄養/安親）</div><div class="value">${Utils.money(serviceRevenue)}</div></div>
        <div class="stat-card"><div class="label">課程收入</div><div class="value">${Utils.money(courseRevenue)}</div></div>
      </div>
      <div class="grid grid-4" style="margin-top:16px;">
        <div class="stat-card"><div class="label">總毛利</div><div class="value up">${Utils.money(totalProfit)}</div><div class="hint">毛利率 ${(totalRevenue ? totalProfit / totalRevenue * 100 : 0).toFixed(1)}%</div></div>
      </div>

      <div class="card">
        <div class="card-title">每日營收趨勢</div>
        ${chartHtml(dailySeries(orders))}
      </div>

      <div class="card">
        <div class="card-title">服務銷售（美容 / 寄養 / 安親）</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>服務名稱</th><th class="text-right">銷售次數</th><th class="text-right">銷售額</th><th class="text-right">成本</th><th class="text-right">毛利</th><th class="text-right">毛利率</th></tr></thead>
            <tbody>
              ${serviceStats.length ? serviceStats.map((r) => `
                <tr><td>${Utils.escapeHtml(r.name)}</td><td class="text-right">${r.qty}</td><td class="text-right">${Utils.money(r.revenue)}</td><td class="text-right muted">${Utils.money(r.cost)}</td><td class="text-right">${Utils.money(r.profit)}</td><td class="text-right">${r.margin.toFixed(1)}%</td></tr>
              `).join('') : `<tr><td colspan="6"><div class="empty-state">此區間尚無服務銷售</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-title">美容教學課程收入</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>課程名稱</th><th class="text-right">報名人數</th><th class="text-right">銷售額</th><th class="text-right">成本</th><th class="text-right">毛利</th><th class="text-right">毛利率</th></tr></thead>
            <tbody>
              ${courseStats.length ? courseStats.map((r) => `
                <tr><td>${Utils.escapeHtml(r.name)}</td><td class="text-right">${r.qty}</td><td class="text-right">${Utils.money(r.revenue)}</td><td class="text-right muted">${Utils.money(r.cost)}</td><td class="text-right">${Utils.money(r.profit)}</td><td class="text-right">${r.margin.toFixed(1)}%</td></tr>
              `).join('') : `<tr><td colspan="6"><div class="empty-state">此區間尚無課程收入</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-title">商品銷售 / 成本 / 毛利</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>商品名稱</th><th class="text-right">銷售數量</th><th class="text-right">銷售額</th><th class="text-right">成本</th><th class="text-right">毛利</th><th class="text-right">毛利率</th></tr></thead>
            <tbody>
              ${productStats.length ? productStats.map((r) => `
                <tr><td>${Utils.escapeHtml(r.name)}</td><td class="text-right">${r.qty}</td><td class="text-right">${Utils.money(r.revenue)}</td><td class="text-right muted">${Utils.money(r.cost)}</td><td class="text-right">${Utils.money(r.profit)}</td><td class="text-right">${r.margin.toFixed(1)}%</td></tr>
              `).join('') : `<tr><td colspan="6"><div class="empty-state">此區間尚無商品銷售</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('f-report-from').addEventListener('change', (e) => { dateFrom = e.target.value; render(); });
    document.getElementById('f-report-to').addEventListener('change', (e) => { dateTo = e.target.value; render(); });
    root().querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
      const today = new Date();
      if (b.dataset.range === 'today') { dateFrom = dateTo = DB.todayStr(); }
      else if (b.dataset.range === 'week') { dateFrom = new Date(today - 6 * 86400000).toISOString().slice(0, 10); dateTo = DB.todayStr(); }
      else { const first = new Date(today.getFullYear(), today.getMonth(), 1); dateFrom = first.toISOString().slice(0, 10); dateTo = DB.todayStr(); }
      render();
    }));
    document.getElementById('btn-export-report').addEventListener('click', () => {
      const rows = [['商品名稱', '銷售數量', '銷售額', '成本', '毛利', '毛利率(%)']];
      productStats.forEach((r) => rows.push([r.name, r.qty, r.revenue, r.cost, r.profit, r.margin.toFixed(1)]));
      Utils.downloadCSV('商品銷售報表.csv', rows);
    });
  }

  return { render };
})();
