/* ========================================================================
 * main.js - 路由 / 初始化
 * ======================================================================== */
const App = (() => {
  const titles = {
    dashboard: '營運總覽',
    pos: 'POS 收銀',
    reservations: '訂單管理',
    members: '會員管理',
    courses: '美容教學課程',
    orders: '交易紀錄查詢',
    products: '商品管理',
    purchasing: '進貨管理',
    inventory: '庫存管理',
    reports: '報表',
    settings: '設定',
  };

  const modules = {
    dashboard: Dashboard,
    pos: POS,
    reservations: Reservations,
    members: Members,
    courses: Courses,
    orders: Orders,
    products: Products,
    purchasing: Purchasing,
    inventory: Inventory,
    reports: Reports,
    settings: Settings,
  };

  let current = 'dashboard';

  function go(view) {
    if (!titles[view]) return;
    current = view;
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.view === view));
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== 'view-' + view; });
    document.getElementById('view-title').textContent = titles[view];
    modules[view].render();
  }

  function refresh() {
    modules[current].render();
  }

  function renderOperatorSelect() {
    const sel = document.getElementById('operator-select');
    const current = DB.getCurrentUser();
    sel.innerHTML = DB.state.users.map((u) => `<option value="${u.id}" ${u.id === current.id ? 'selected' : ''}>${Utils.escapeHtml(u.name)}（${u.role === 'admin' ? '管理員' : '店員'}）</option>`).join('');
  }

  function initClock() {
    const clockEl = document.getElementById('clock');
    const dateEl = document.getElementById('sidebar-date');
    function tick() {
      const now = new Date();
      const p = (n) => String(n).padStart(2, '0');
      clockEl.textContent = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
      const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
      dateEl.textContent = `${now.getFullYear()}/${p(now.getMonth() + 1)}/${p(now.getDate())} (週${week})`;
    }
    tick();
    setInterval(tick, 1000);
  }

  function init() {
    document.querySelectorAll('.nav-item').forEach((n) => {
      n.addEventListener('click', () => go(n.dataset.view));
    });
    document.getElementById('modal-backdrop').addEventListener('mousedown', (e) => {
      if (e.target.id === 'modal-backdrop') Utils.closeModal();
    });
    document.getElementById('btn-reset-data').addEventListener('click', () => {
      Utils.confirmModal('確定要重置為示範資料嗎？目前所有資料將會遺失。', () => {
        DB.reset();
        Utils.toast('已重置示範資料', 'success');
        renderOperatorSelect();
        refresh();
      });
    });
    document.getElementById('operator-select').addEventListener('change', (e) => {
      DB.setCurrentUser(e.target.value);
      Utils.toast(`已切換操作者為 ${DB.getCurrentUser().name}`, 'success');
    });
    document.getElementById('store-name-label').textContent = DB.state.meta.storeName;
    renderOperatorSelect();
    initClock();
    go('dashboard');
  }

  return { go, refresh, init, renderOperatorSelect };
})();

document.addEventListener('DOMContentLoaded', App.init);
