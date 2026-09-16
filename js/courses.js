/* ========================================================================
 * courses.js - 美容教學課程（課程管理 / 報名管理）
 * ======================================================================== */
const Courses = (() => {
  let tab = 'courses';
  let enrollStatusFilter = 'all';

  function root() { return document.getElementById('view-courses'); }

  function enrolledCount(courseId) {
    return DB.state.enrollments.filter((e) => e.courseId === courseId && e.status !== '已取消').length;
  }

  function courseStatus(course) {
    if (course.manualStatus === '已取消') return '已取消';
    const start = new Date(course.startDateTime);
    const end = new Date(start.getTime() + (Number(course.durationHours) || 0) * 3600000);
    if (!isNaN(end.getTime()) && new Date() > end) return '已結束';
    if (enrolledCount(course.id) >= course.capacity) return '已額滿';
    return '招生中';
  }

  function statusBadge(st) {
    const map = { 招生中: 'green', 已額滿: 'yellow', 已結束: 'gray', 已取消: 'red' };
    return `<span class="badge ${map[st] || 'gray'}">${st}</span>`;
  }

  function fmtDT(dt) {
    if (!dt) return '';
    const d = new Date(dt);
    if (isNaN(d.getTime())) return dt;
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function photoBox(photo, size = 'md') {
    const dims = size === 'sm' ? 'width:48px;height:64px;' : 'width:120px;height:160px;';
    if (photo) return `<img src="${photo}" style="${dims}object-fit:cover;border-radius:10px;border:1px solid var(--line);flex-shrink:0;">`;
    return `<div style="${dims}border-radius:10px;border:1px dashed var(--line);background:#faf7f1;display:flex;align-items:center;justify-content:center;font-size:${size === 'sm' ? '18px' : '30px'};color:#c9bfab;flex-shrink:0;">🧑‍🏫</div>`;
  }

  function renderCoursesTab() {
    const list = [...DB.state.courses].sort((a, b) => (a.startDateTime || '').localeCompare(b.startDateTime || ''));
    return `
      <div class="toolbar">
        <div class="spacer"></div>
        <button class="btn primary" id="btn-new-course">＋ 新增課程</button>
      </div>
      <div class="grid grid-3">
        ${list.length ? list.map((c) => {
          const st = courseStatus(c);
          const enrolled = enrolledCount(c.id);
          return `
          <div class="card" style="display:flex;gap:12px;">
            ${photoBox(c.instructorPhoto)}
            <div style="flex:1;min-width:0;">
              <div class="flex" style="justify-content:space-between;gap:6px;">
                <div style="font-weight:700;font-size:14px;">${Utils.escapeHtml(c.name)}</div>
                ${statusBadge(st)}
              </div>
              <div class="muted small">${Utils.escapeHtml(c.category || '')} · ${Utils.escapeHtml(c.location || '')}</div>
              <div class="small" style="margin-top:6px;">👤 ${Utils.escapeHtml(c.instructorName || '未指定')}</div>
              <div class="muted small" style="margin-top:2px;line-height:1.4;max-height:38px;overflow:hidden;">${Utils.escapeHtml(c.instructorBio || '')}</div>
              <div class="small" style="margin-top:6px;">🗓 ${fmtDT(c.startDateTime)}（${c.durationHours || 0} 小時）</div>
              <div class="small" style="margin-top:2px;">💰 ${Utils.money(c.price)}／人</div>
              <div class="small" style="margin-top:2px;">👥 報名 ${enrolled} / ${c.capacity} 名</div>
              <div class="btn-row" style="margin-top:10px;">
                <button class="btn sm" data-edit="${c.id}">編輯</button>
                <button class="btn sm danger" data-del="${c.id}">刪除</button>
              </div>
            </div>
          </div>
        `;
        }).join('') : `<div class="empty-state" style="grid-column:1/-1;">尚無課程，點選右上角新增課程</div>`}
      </div>
    `;
  }

  function renderEnrollTab() {
    let list = [...DB.state.enrollments].sort((a, b) => b.no.localeCompare(a.no));
    if (enrollStatusFilter !== 'all') list = list.filter((e) => e.status === enrollStatusFilter);
    const courseName = (id) => { const c = DB.state.courses.find((x) => x.id === id); return c ? c.name : '(已刪除課程)'; };
    const coursePrice = (id) => { const c = DB.state.courses.find((x) => x.id === id); return c ? c.price : 0; };
    return `
      <div class="toolbar">
        <div class="tabs" style="border:none;margin:0;">
          ${['all', '待結帳', '已結帳', '已取消'].map((st) => `<button class="tab-btn ${enrollStatusFilter === st ? 'active' : ''}" data-estatus="${st}">${st === 'all' ? '全部' : st}</button>`).join('')}
        </div>
        <div class="spacer"></div>
        <button class="btn primary" id="btn-new-enroll">＋ 新增報名</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>報名編號</th><th>課程</th><th>學員</th><th>電話</th><th>寵物</th><th class="text-right">費用</th><th>狀態</th><th></th></tr></thead>
            <tbody>
              ${list.length ? list.map((e) => `
                <tr>
                  <td class="nowrap">${e.no}</td>
                  <td>${Utils.escapeHtml(courseName(e.courseId))}</td>
                  <td>${Utils.escapeHtml(e.studentName)}</td>
                  <td>${Utils.escapeHtml(e.phone || '')}</td>
                  <td class="muted">${Utils.escapeHtml(e.petName || '')}</td>
                  <td class="text-right">${Utils.money(coursePrice(e.courseId))}</td>
                  <td>${statusBadge2(e.status)}</td>
                  <td class="nowrap">
                    ${e.status === '待結帳' ? `<button class="btn sm primary" data-checkout="${e.id}">轉POS結帳</button>` : ''}
                    ${e.status !== '已結帳' ? `<button class="btn sm danger" data-cancel="${e.id}">取消</button>` : ''}
                  </td>
                </tr>
              `).join('') : `<tr><td colspan="8"><div class="empty-state">尚無報名紀錄</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function statusBadge2(st) {
    const map = { 待結帳: 'orange', 已結帳: 'green', 已取消: 'red' };
    return `<span class="badge ${map[st] || 'gray'}">${st}</span>`;
  }

  function openCourseForm(course) {
    const isEdit = !!course;
    course = course || { name: '', category: '', instructorName: '', instructorBio: '', instructorPhoto: '', startDateTime: DB.todayStr() + 'T10:00', durationHours: 4, capacity: 8, price: 0, cost: 0, location: '', manualStatus: '', note: '' };
    let photoData = course.instructorPhoto || '';

    function photoSectionHtml() {
      return `
        <div id="photo-preview-wrap">${photoBox(photoData)}</div>
        <div class="field" style="flex:1;">
          <label>美容師照片（建議直式人像照）</label>
          <input type="file" id="f-photo" accept="image/*">
          <div class="hint">系統會自動壓縮縮圖，適合直式證件照比例</div>
          ${photoData ? `<button class="link-btn" id="btn-remove-photo" type="button">移除照片</button>` : ''}
        </div>
      `;
    }

    function bindPhotoSection() {
      document.getElementById('f-photo').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          photoData = await Utils.readImageAsDataURL(file, 480, 640, 0.85);
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

    function bodyHtml() {
      return `
        <div class="modal-title">${isEdit ? '編輯' : '新增'}課程 <button class="icon-btn" id="modal-close">✕</button></div>
        <div class="flex gap-8" id="photo-section" style="align-items:flex-start;margin-bottom:14px;">${photoSectionHtml()}</div>
        <div class="form-grid">
          <div class="field full"><label>課程名稱 *</label><input type="text" id="f-name" value="${Utils.escapeHtml(course.name)}"></div>
          <div class="field"><label>課程分類</label><input type="text" id="f-course-cat" value="${Utils.escapeHtml(course.category)}" placeholder="入門班 / 進階班 / 證照班"></div>
          <div class="field"><label>上課地點</label><input type="text" id="f-loc" value="${Utils.escapeHtml(course.location)}"></div>
          <div class="field"><label>美容師姓名 *</label><input type="text" id="f-inst" value="${Utils.escapeHtml(course.instructorName)}"></div>
          <div class="field"><label>美容師資歷</label><input type="text" id="f-bio" value="${Utils.escapeHtml(course.instructorBio)}" placeholder="證照 / 年資 / 得獎經歷"></div>
          <div class="field"><label>開課時間 *</label><input type="datetime-local" id="f-start" value="${course.startDateTime}"></div>
          <div class="field"><label>課程時數（小時）</label><input type="number" id="f-dur" value="${course.durationHours}"></div>
          <div class="field"><label>報名名額 *</label><input type="number" id="f-cap" value="${course.capacity}" min="1"></div>
          <div class="field"><label>已報名人數</label><input type="text" value="${isEdit ? enrolledCount(course.id) : 0}" disabled></div>
          <div class="field"><label>課程售價 *</label><input type="number" id="f-price" value="${course.price}"></div>
          <div class="field"><label>課程成本</label><input type="number" id="f-cost" value="${course.cost}"></div>
          <div class="field"><label>狀態</label>
            <select id="f-manual-status">
              <option value="" ${!course.manualStatus ? 'selected' : ''}>自動（依名額/時間判斷）</option>
              <option value="已取消" ${course.manualStatus === '已取消' ? 'selected' : ''}>手動標記為已取消</option>
            </select>
          </div>
          <div class="field full"><label>備註</label><textarea id="f-note">${Utils.escapeHtml(course.note || '')}</textarea></div>
        </div>
        <div class="modal-foot">
          <button class="btn" id="modal-cancel">取消</button>
          <button class="btn primary" id="btn-save-course">儲存</button>
        </div>
      `;
    }

    function rerender() { Utils.openModal(bodyHtml(), { wide: true }); bind(); }

    function bind() {
      document.getElementById('modal-close').onclick = Utils.closeModal;
      document.getElementById('modal-cancel').onclick = Utils.closeModal;
      bindPhotoSection();

      let courseSaved = false;
      document.getElementById('btn-save-course').onclick = (e) => {
        if (courseSaved) return;
        const name = document.getElementById('f-name').value.trim();
        const instructorName = document.getElementById('f-inst').value.trim();
        if (!name) { Utils.toast('請輸入課程名稱', 'error'); return; }
        if (!instructorName) { Utils.toast('請輸入美容師姓名', 'error'); return; }
        const capacity = Number(document.getElementById('f-cap').value) || 1;
        if (isEdit && capacity < enrolledCount(course.id)) { Utils.toast('名額不可小於目前已報名人數', 'error'); return; }
        const data = {
          name, instructorName,
          category: document.getElementById('f-course-cat').value.trim(),
          location: document.getElementById('f-loc').value.trim(),
          instructorBio: document.getElementById('f-bio').value.trim(),
          instructorPhoto: photoData,
          startDateTime: document.getElementById('f-start').value,
          durationHours: Number(document.getElementById('f-dur').value) || 0,
          capacity,
          price: Number(document.getElementById('f-price').value) || 0,
          cost: Number(document.getElementById('f-cost').value) || 0,
          manualStatus: document.getElementById('f-manual-status').value,
          note: document.getElementById('f-note').value.trim(),
        };
        courseSaved = true;
        e.currentTarget.disabled = true;
        if (isEdit) Object.assign(course, data);
        else DB.state.courses.push({ id: DB.uid('CRS'), ...data });
        DB.save();
        Utils.closeModal();
        Utils.toast('已儲存', 'success');
        render();
      };
    }

    rerender();
  }

  function openEnrollForm() {
    const available = DB.state.courses.filter((c) => courseStatus(c) === '招生中');
    if (!available.length) { Utils.toast('目前沒有招生中的課程', 'error'); return; }
    Utils.openModal(`
      <div class="modal-title">新增課程報名 <button class="icon-btn" id="modal-close">✕</button></div>
      <div class="field"><label>課程 *</label>
        <select id="f-course">
          ${available.map((c) => `<option value="${c.id}">${Utils.escapeHtml(c.name)}（剩 ${c.capacity - enrolledCount(c.id)} 名 · ${Utils.money(c.price)}）</option>`).join('')}
        </select>
      </div>
      <div class="form-grid">
        <div class="field"><label>學員姓名 *</label><input type="text" id="f-student"></div>
        <div class="field"><label>聯絡電話</label><input type="text" id="f-phone"></div>
        <div class="field"><label>寵物名稱</label><input type="text" id="f-pet"></div>
      </div>
      <div class="field"><label>備註</label><textarea id="f-note"></textarea></div>
      <div class="modal-foot">
        <button class="btn" id="modal-cancel">取消</button>
        <button class="btn primary" id="btn-save-enroll">儲存報名</button>
      </div>
    `);
    let enrollSaved = false;
    document.getElementById('modal-close').onclick = Utils.closeModal;
    document.getElementById('modal-cancel').onclick = Utils.closeModal;
    document.getElementById('btn-save-enroll').onclick = (e) => {
      if (enrollSaved) return; // 第二層防護：避免重複點擊佔用兩個名額
      const courseId = document.getElementById('f-course').value;
      const course = DB.state.courses.find((c) => c.id === courseId);
      const studentName = document.getElementById('f-student').value.trim();
      if (!studentName) { Utils.toast('請輸入學員姓名', 'error'); return; }
      if (!course || enrolledCount(course.id) >= course.capacity) { Utils.toast('此課程名額已滿', 'error'); return; }
      enrollSaved = true;
      e.currentTarget.disabled = true; // 第一層防護
      const enrollment = {
        id: DB.uid('ENR'), no: DB.nextDocNo('ENR', DB.state.enrollments), courseId,
        studentName, phone: document.getElementById('f-phone').value.trim(),
        petName: document.getElementById('f-pet').value.trim(), note: document.getElementById('f-note').value.trim(),
        enrolledAt: new Date().toISOString(), status: '待結帳', posOrderId: null,
      };
      DB.state.enrollments.push(enrollment);
      DB.save();
      Utils.closeModal();
      Utils.toast('已完成報名，請至報名列表轉POS結帳收款', 'success');
      render();
    };
  }

  function bind() {
    root().querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));

    if (tab === 'courses') {
      const newBtn = document.getElementById('btn-new-course');
      if (newBtn) newBtn.addEventListener('click', () => openCourseForm(null));
      root().querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
        openCourseForm(DB.state.courses.find((c) => c.id === b.dataset.edit));
      }));
      root().querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
        if (enrolledCount(b.dataset.del) > 0) { Utils.toast('此課程已有學員報名，無法刪除，請改為手動標記已取消', 'error'); return; }
        Utils.confirmModal('確定要刪除此課程嗎？', () => {
          DB.state.courses = DB.state.courses.filter((c) => c.id !== b.dataset.del);
          DB.save(); render(); Utils.toast('已刪除', 'success');
        });
      }));
    } else {
      root().querySelectorAll('[data-estatus]').forEach((b) => b.addEventListener('click', () => { enrollStatusFilter = b.dataset.estatus; render(); }));
      const newBtn = document.getElementById('btn-new-enroll');
      if (newBtn) newBtn.addEventListener('click', openEnrollForm);
      root().querySelectorAll('[data-checkout]').forEach((b) => b.addEventListener('click', () => {
        POS.loadEnrollment(b.dataset.checkout);
      }));
      root().querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => {
        Utils.confirmModal('確定要取消此報名嗎？', () => {
          const e = DB.state.enrollments.find((x) => x.id === b.dataset.cancel);
          e.status = '已取消';
          DB.save(); render(); Utils.toast('已取消報名', 'success');
        });
      }));
    }
  }

  function render() {
    root().innerHTML = `
      <div class="tabs">
        <button class="tab-btn ${tab === 'courses' ? 'active' : ''}" data-tab="courses">課程管理</button>
        <button class="tab-btn ${tab === 'enroll' ? 'active' : ''}" data-tab="enroll">報名管理</button>
      </div>
      ${tab === 'courses' ? renderCoursesTab() : renderEnrollTab()}
    `;
    bind();
  }

  return { render, courseStatus, enrolledCount };
})();
