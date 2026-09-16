/* ========================================================================
 * db.js - 本機資料層（localStorage 模擬後端資料庫）
 * ======================================================================== */
const DB = (() => {
  const KEY = 'petpos_v2';

  function uid(prefix) {
    return (prefix ? prefix + '-' : '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function nightsBetween(from, to) {
    if (!from || !to) return 0;
    const ms = new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00');
    return Math.max(0, Math.round(ms / 86400000));
  }

  function seed() {
    const now = new Date();
    const productCategories = ['飼料', '零食', '用品', '保健品'].map((name) => ({ id: uid('CAT'), name }));
    const products = [
      { id: uid('P'), name: '天然狗糧 5kg', category: '飼料', brand: 'Royal', barcode: '4710001000015', spec: '5kg/包', price: 1280, cost: 850, safetyStock: 5, stock: 18, enabled: true, unit: '包', batches: [{ id: uid('B'), qty: 18, expiryDate: '2027-03-01', note: '批20260901', receivedDate: '2026-09-01' }] },
      { id: uid('P'), name: '貓咪主食罐 80g', category: '飼料', brand: 'Ciao', barcode: '4710001000022', spec: '80g/罐', price: 45, cost: 25, safetyStock: 20, stock: 60, enabled: true, unit: '罐', batches: [{ id: uid('B'), qty: 60, expiryDate: '2026-10-05', note: '批20260901', receivedDate: '2026-09-01' }] },
      { id: uid('P'), name: '潔牙骨（大）', category: '零食', brand: 'Pedigree', barcode: '4710001000039', spec: '單支', price: 120, cost: 60, safetyStock: 10, stock: 8, enabled: true, unit: '支', batches: [{ id: uid('B'), qty: 8, expiryDate: '2026-09-28', note: '批20260801', receivedDate: '2026-08-01' }] },
      { id: uid('P'), name: '寵物洗毛精 500ml', category: '用品', brand: 'Bio-Groom', barcode: '4710001000046', spec: '500ml/瓶', price: 350, cost: 190, safetyStock: 6, stock: 12, enabled: true, unit: '瓶', batches: [] },
      { id: uid('P'), name: '關節保健品', category: '保健品', brand: 'NHV', barcode: '4710001000053', spec: '60顆/罐', price: 890, cost: 560, safetyStock: 4, stock: 3, enabled: true, unit: '罐', batches: [{ id: uid('B'), qty: 3, expiryDate: '2026-09-22', note: '批20260701', receivedDate: '2026-07-01' }] },
      { id: uid('P'), name: '寵物外出提籠', category: '用品', brand: 'IRIS', barcode: '4710001000060', spec: 'M號', price: 990, cost: 650, safetyStock: 2, stock: 5, enabled: true, unit: '個', batches: [] },
    ];

    const services = [
      { id: uid('S'), name: '短毛洗澡（S）', type: '美容', category: '洗澡', price: 500, cost: 150, duration: 60, priceUnit: '次', enabled: true },
      { id: uid('S'), name: '短毛洗澡（M）', type: '美容', category: '洗澡', price: 650, cost: 180, duration: 75, priceUnit: '次', enabled: true },
      { id: uid('S'), name: '長毛洗澡+造型（M）', type: '美容', category: '美容', price: 1200, cost: 300, duration: 120, priceUnit: '次', enabled: true },
      { id: uid('S'), name: '剪指甲', type: '美容', category: '單項', price: 100, cost: 20, duration: 10, priceUnit: '次', enabled: true },
      { id: uid('S'), name: '標準犬房（每晚）', type: '寄養', category: '住宿', price: 600, cost: 150, duration: 0, priceUnit: '晚', enabled: true },
      { id: uid('S'), name: 'VIP套房（每晚）', type: '寄養', category: '住宿', price: 900, cost: 220, duration: 0, priceUnit: '晚', enabled: true },
      { id: uid('S'), name: '安親臨托（半日）', type: '安親', category: '臨托', price: 350, cost: 80, duration: 240, priceUnit: '次', enabled: true },
      { id: uid('S'), name: '安親臨托（全日）', type: '安親', category: '臨托', price: 600, cost: 150, duration: 480, priceUnit: '次', enabled: true },
    ];

    const suppliers = [
      { id: uid('SUP'), name: '大眾寵物用品批發', contact: '陳先生', phone: '02-2345-6789', note: '主要飼料供應商' },
      { id: uid('SUP'), name: '優寵國際貿易', contact: '林小姐', phone: '04-2233-4455', note: '保健品/用品' },
    ];

    const purchases = [
      {
        id: uid('PO'), no: 'PO-20260901-01', supplierId: suppliers[0].id, date: '2026-09-01',
        items: [
          { productId: products[0].id, qty: 10, cost: 850, expiryDate: '2027-03-01' },
          { productId: products[1].id, qty: 40, cost: 25, expiryDate: '2026-10-05' },
        ],
        status: '已入庫', note: '', createdAt: now.toISOString(),
      },
    ];

    const inventoryLogs = [
      { id: uid('LOG'), date: '2026-09-01', productId: products[0].id, type: '進貨', qty: 10, note: 'PO-20260901-01', stockAfter: 18 },
      { id: uid('LOG'), date: '2026-09-01', productId: products[1].id, type: '進貨', qty: 40, note: 'PO-20260901-01', stockAfter: 60 },
    ];

    const reservations = [
      {
        id: uid('RES'), no: 'RES-' + todayStr().replace(/-/g, '') + '-0001', category: '美容',
        petName: 'Momo', ownerName: '王小姐', phone: '0912-345-678',
        serviceIds: [services[0].id], staffName: '小美', date: todayStr(), dateFrom: '', dateTo: '', qty: 1,
        status: '待結帳', note: '', posOrderId: null,
      },
      {
        id: uid('RES'), no: 'RES-' + todayStr().replace(/-/g, '') + '-0002', category: '美容',
        petName: '豆豆', ownerName: '陳先生', phone: '0933-222-111',
        serviceIds: [services[2].id, services[3].id], staffName: '小華', date: todayStr(), dateFrom: '', dateTo: '', qty: 1,
        status: '待結帳', note: '怕吹風機，需安撫', posOrderId: null,
      },
      {
        id: uid('RES'), no: 'RES-' + todayStr().replace(/-/g, '') + '-0003', category: '寄養',
        petName: '柚子', ownerName: '林小姐', phone: '0955-888-777',
        serviceIds: [services[4].id], staffName: '小美', date: '', dateFrom: todayStr(), dateTo: todayStr().slice(0, 8) + String(Number(todayStr().slice(8, 10)) + 3).padStart(2, '0'), qty: 1,
        status: '待結帳', note: '會自己帶飼料來', posOrderId: null,
      },
      {
        id: uid('RES'), no: 'RES-' + todayStr().replace(/-/g, '') + '-0004', category: '安親',
        petName: '哈奇', ownerName: '張先生', phone: '0966-111-222',
        serviceIds: [services[6].id], staffName: '', date: todayStr(), dateFrom: '', dateTo: '', qty: 1,
        status: '待結帳', note: '', posOrderId: null,
      },
    ];

    const courses = [
      {
        id: uid('CRS'), name: '寵物美容入門班（單日體驗）', category: '入門班',
        instructorName: '陳雅婷', instructorBio: '日本寵物美容師執照 / 10年沙龍實務經驗 / 曾任連鎖寵物美容店技術總監',
        instructorPhoto: '', startDateTime: todayStr() + 'T10:00', durationHours: 4,
        capacity: 8, price: 2800, cost: 800, location: '店內教室', manualStatus: '', note: '需自備筆記工具，現場提供練習犬',
      },
      {
        id: uid('CRS'), name: '寵物造型師專業養成班', category: '證照班',
        instructorName: '林建宏', instructorBio: 'TGA 國際寵物美容師證照 / 曾獲全國寵物美容大賽冠軍 / 教學經驗8年',
        instructorPhoto: '', startDateTime: todayStr().slice(0, 8) + '20' + 'T13:00', durationHours: 6,
        capacity: 6, price: 15800, cost: 4000, location: '店內教室', manualStatus: '', note: '共8堂課，可分期付款',
      },
    ];

    const enrollments = [];
    const posOrders = [];
    const members = [
      { id: uid('M'), name: '王小姐', phone: '0912-345-678', email: '', address: '', balance: 0, note: '', pets: [{ id: uid('PET'), name: 'Momo', type: '狗', note: '' }] },
      { id: uid('M'), name: '陳先生', phone: '0933-222-111', email: '', address: '', balance: 0, note: '', pets: [{ id: uid('PET'), name: '豆豆', type: '狗', note: '' }] },
    ];
    const memberBalanceLogs = [];
    const users = [{ id: uid('U'), name: '店長', role: 'admin', pin: '0000' }];

    return {
      meta: {
        storeName: '寵芯訂POS系統', taxIncluded: true, version: 2, currentUserId: users[0].id,
        // 折扣防弊政策（BUG-009）：預設不限制（維持原行為），店家可於「設定」頁調整。
        discountPolicy: { maxDiscountPercent: 100, managerApprovalRequired: false },
        // BUG-003：商品售價是否允許為 0（例如贈品/樣品）。預設 false，與表單「售價 *」必填標示一致；
        // 店家如有免費商品/贈品需求，可於「設定」頁開啟。
        allowZeroPricedProducts: false,
      },
      products, services, suppliers, purchases, inventoryLogs, reservations, courses, enrollments, posOrders, members, memberBalanceLogs,
      productCategories,
      users,
    };
  }

  /** 補齊舊版資料缺少的欄位（避免既有 localStorage 資料在改版後出錯） */
  function migrate(s) {
    if (!s.productCategories) {
      const names = Array.from(new Set((s.products || []).map((p) => p.category).filter(Boolean)));
      s.productCategories = names.map((name) => ({ id: uid('CAT'), name }));
    }
    if (!s.meta.currentUserId && s.users && s.users[0]) {
      s.meta.currentUserId = s.users[0].id;
    }
    if (!s.meta.discountPolicy) {
      s.meta.discountPolicy = { maxDiscountPercent: 100, managerApprovalRequired: false };
    }
    if (s.meta.allowZeroPricedProducts === undefined) {
      s.meta.allowZeroPricedProducts = false;
    }
    if (!s.members) {
      s.members = [];
    }
    // 會員資料結構升級：單一寵物欄位（petName/petType）→ 多寵物陣列（pets[]）；補上 email/address/balance。
    s.members.forEach((m) => {
      if (!m.pets) {
        m.pets = m.petName ? [{ id: uid('PET'), name: m.petName, type: m.petType || '', note: '' }] : [];
        delete m.petName;
        delete m.petType;
      }
      if (m.email === undefined) m.email = '';
      if (m.address === undefined) m.address = '';
      if (m.balance === undefined) m.balance = 0;
    });
    if (!s.memberBalanceLogs) {
      s.memberBalanceLogs = [];
    }
    return s;
  }

  /** 目前操作者（AUTH-DESIGN.md 第一階段：僅供身份歸屬使用，非真正登入驗證） */
  function getCurrentUser() {
    const found = state.users.find((u) => u.id === state.meta.currentUserId);
    return found || state.users[0] || { id: null, name: '店員', role: 'staff' };
  }

  function setCurrentUser(userId) {
    if (!state.users.find((u) => u.id === userId)) return false;
    state.meta.currentUserId = userId;
    save();
    return true;
  }

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) { console.error('DB load failed', e); }
    const s = seed();
    localStorage.setItem(KEY, JSON.stringify(s));
    return s;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error('DB save failed', e);
      if (typeof Utils !== 'undefined') Utils.toast('儲存失敗，瀏覽器儲存空間可能已滿（可能是課程照片過大）', 'error');
    }
  }

  function reset() {
    state = seed();
    save();
  }

  /** 產生格式如 RES-20260909-0007 的單號，序號依當日已建立筆數自動遞增 */
  function nextDocNo(prefix, list) {
    const head = prefix + '-' + todayStr().replace(/-/g, '');
    const count = list.filter((it) => it.no && it.no.startsWith(head)).length;
    return head + '-' + String(count + 1).padStart(4, '0');
  }

  return {
    uid, todayStr, save, reset, nextDocNo, nightsBetween, getCurrentUser, setCurrentUser,
    get state() { return state; },
  };
})();
