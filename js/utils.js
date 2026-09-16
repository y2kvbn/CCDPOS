/* ========================================================================
 * utils.js - 共用工具函式
 * ======================================================================== */
const Utils = (() => {
  function money(n) {
    n = Number(n) || 0;
    return '$' + n.toLocaleString('zh-TW', { maximumFractionDigits: 0 });
  }

  function fmtDate(d) {
    if (!d) return '';
    return d;
  }

  function fmtDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /** BUG-007：切出當前頁資料。統計數字（總筆數/合計金額等）請用完整的 arr，不要用 pageItems。 */
  function paginate(arr, page, perPage) {
    const totalPages = Math.max(1, Math.ceil(arr.length / perPage));
    const clampedPage = Math.min(Math.max(1, page || 1), totalPages);
    const start = (clampedPage - 1) * perPage;
    return { pageItems: arr.slice(start, start + perPage), totalPages, page: clampedPage, total: arr.length };
  }

  function paginationHtml(page, totalPages) {
    if (totalPages <= 1) return '';
    return `
      <div class="pagination">
        <button class="btn sm" data-pg="prev" ${page <= 1 ? 'disabled' : ''}>‹ 上一頁</button>
        <span class="muted small">第 ${page} / ${totalPages} 頁</span>
        <button class="btn sm" data-pg="next" ${page >= totalPages ? 'disabled' : ''}>下一頁 ›</button>
      </div>
    `;
  }

  let toastTimer = null;
  function toast(msg, type = 'info') {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'toast show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 2400);
  }

  /**
   * BUG-010：自製確認對話框，取代 window.confirm()。
   * 原生 confirm() 在部分平板內建瀏覽器 / Kiosk 模式 / WebView 環境下可能被封鎖或無法正常顯示，
   * 導致刪除/退款/作廢等操作完全無法觸發且無任何錯誤訊息。改用系統既有的 Modal 樣式自行實作，
   * 疊加於畫面最上層（不影響原本可能已開啟的其他 Modal），支援點擊取消／ESC／點擊背景取消。
   *
   * 用法（非同步，callback style）：
   *   Utils.confirmModal('確定要刪除嗎？', () => { ...使用者按下確認後才執行的動作... });
   */
  function confirmModal(message, onConfirm, opts = {}) {
    const danger = opts.danger !== false;
    const okLabel = opts.okLabel || '確認';
    const cancelLabel = opts.cancelLabel || '取消';

    const overlay = document.createElement('div');
    overlay.setAttribute('data-confirm-overlay', '');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(30,26,20,0.55);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:22px 24px;width:400px;max-width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div id="confirm-modal-msg" style="font-size:14.5px;line-height:1.7;color:#2b2620;margin-bottom:18px;white-space:pre-wrap;"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button type="button" id="confirm-modal-cancel">${escapeHtml(cancelLabel)}</button>
          <button type="button" id="confirm-modal-ok">${escapeHtml(okLabel)}</button>
        </div>
      </div>
    `;
    overlay.querySelector('#confirm-modal-msg').textContent = message;
    const cancelBtn = overlay.querySelector('#confirm-modal-cancel');
    const okBtn = overlay.querySelector('#confirm-modal-ok');
    cancelBtn.className = 'btn';
    okBtn.className = danger ? 'btn danger' : 'btn primary';
    document.body.appendChild(overlay);

    function cleanup() {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
    }
    function onKeydown(e) {
      if (e.key === 'Escape') cleanup();
    }
    document.addEventListener('keydown', onKeydown);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) cleanup(); });
    cancelBtn.onclick = cleanup;
    okBtn.onclick = () => { cleanup(); onConfirm(); };
  }

  function openModal(html, opts = {}) {
    const backdrop = document.getElementById('modal-backdrop');
    const box = document.getElementById('modal-box');
    box.innerHTML = html;
    box.classList.toggle('modal-wide', !!opts.wide);
    backdrop.classList.add('show');
    document.body.classList.add('modal-open');
  }

  function closeModal() {
    const backdrop = document.getElementById('modal-backdrop');
    backdrop.classList.remove('show');
    document.body.classList.remove('modal-open');
    document.getElementById('modal-box').innerHTML = '';
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) node.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function debounce(fn, wait = 250) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  /**
   * 綁定一個「輸入後會觸發外層整頁重繪」的搜尋輸入框（例如 render() 會整個重建畫面，包含輸入框本身）。
   * 修正兩個問題：
   * 1) 注音/拼音等組字輸入法：組字進行中若因防抖動觸發重繪，輸入框 DOM 節點會被整個銷毀重建，
   *    導致組字被強制中斷、只送出目前選字中的單一符號。這裡改為組字期間完全不觸發 onChange，
   *    直到 compositionend（選字完成）才處理。
   * 2) 一般輸入：重繪會產生全新的輸入框節點，瀏覽器不會自動把焦點移過去，導致每次防抖動觸發重繪後
   *    使用者都要重新點擊才能繼續打字。這裡在 onChange（進而觸發重繪）後，把焦點與游標位置還原到新節點上。
   */
  function bindSearchInput(inputId, onChange, delay = 200) {
    const el = document.getElementById(inputId);
    if (!el) return;
    let composing = false;
    let lastValue = el.value;
    function commit(value) {
      if (value === lastValue) return; // 避免 compositionend 與稍後才觸發的防抖動重複送出同一個值
      lastValue = value;
      const selStart = el.selectionStart;
      const selEnd = el.selectionEnd;
      onChange(value);
      const newEl = document.getElementById(inputId);
      if (newEl) {
        newEl.focus();
        try { newEl.setSelectionRange(selStart, selEnd); } catch (err) { /* 型別不支援時忽略 */ }
      }
    }
    el.addEventListener('compositionstart', () => { composing = true; });
    el.addEventListener('compositionend', (e) => { composing = false; commit(e.target.value); });
    el.addEventListener('input', debounce((e) => {
      if (composing) return;
      commit(e.target.value);
    }, delay));
  }

  /** 讀取圖片檔並縮放壓縮為 dataURL（避免直式人像照片佔用過多 localStorage 空間） */
  function readImageAsDataURL(file, maxW = 480, maxH = 640, quality = 0.85) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) { reject(new Error('請選擇圖片檔案')); return; }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('讀取圖片失敗'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('圖片格式無法解析'));
        img.onload = () => {
          let { width, height } = img;
          const ratio = Math.min(1, maxW / width, maxH / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function downloadCSV(filename, rows) {
    const csv = rows.map((r) => r.map((c) => {
      const s = String(c ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { money, fmtDate, fmtDateTime, escapeHtml, toast, confirmModal, openModal, closeModal, el, debounce, bindSearchInput, downloadCSV, readImageAsDataURL, paginate, paginationHtml };
})();
