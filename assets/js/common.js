/** 여러 페이지에서 함께 쓰는 도구 모음 */
(function () {
  var DAYS = ['일', '월', '화', '수', '목', '금', '토'];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /** 화면에 넣는 모든 데이터는 이 함수로 감싸 HTML 로 해석되지 않게 합니다. */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function parseYmd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  /** 2026-11-12 → 11월 12일 (목) */
  function fmtDate(s) { var d = parseYmd(s); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + DAYS[d.getDay()] + ')'; }
  /** 2026-11-12 → { md: '11.12', dow: '목' } */
  function dateParts(s) { var d = parseYmd(s); return { md: (d.getMonth() + 1) + '.' + d.getDate(), dow: DAYS[d.getDay()], day: d.getDay() }; }

  /** 입력하는 동안 010-1234-5678 형태로 하이픈을 넣어 줍니다. */
  function bindPhoneInput(input) {
    input.addEventListener('input', function () {
      var d = input.value.replace(/\D/g, '').slice(0, 11);
      var out = d;
      if (d.length > 3 && d.length <= 7) out = d.slice(0, 3) + '-' + d.slice(3);
      else if (d.length > 7) out = d.slice(0, 3) + '-' + d.slice(3, d.length - 4) + '-' + d.slice(d.length - 4);
      input.value = out;
    });
  }
  function bindDigits(input, max) {
    input.addEventListener('input', function () { input.value = input.value.replace(/\D/g, '').slice(0, max); });
  }

  function validName(v) { var s = String(v || '').trim(); return s.length >= 2 && s.length <= 20; }
  function validPhone(v) { return /^01[016789]\d{7,8}$/.test(String(v || '').replace(/\D/g, '')); }
  function validPin(v) { return /^\d{4}$/.test(String(v || '')); }

  function setError(input, msg) {
    var field = input.closest('.field');
    if (!field) return;
    var el = field.querySelector('.field-error');
    field.classList.toggle('has-error', !!msg);
    if (el) el.textContent = msg || '';
  }

  var toastTimer;
  function toast(msg, type) {
    var el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg;
    el.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, 3200);
  }

  /** 아래에서 올라오는 시트(모달) 열고 닫기 */
  function openSheet(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.hidden = false;
    document.body.classList.add('no-scroll');
    requestAnimationFrame(function () { el.classList.add('open'); });
    var first = el.querySelector('input, button:not(.sheet-close), textarea, select');
    if (first) setTimeout(function () { first.focus(); }, 250);
  }
  function closeSheet(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('open');
    document.body.classList.remove('no-scroll');
    setTimeout(function () { el.hidden = true; }, 250);
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-close-sheet]');
    if (t) closeSheet(t.getAttribute('data-close-sheet'));
    else if (e.target.classList && e.target.classList.contains('sheet-backdrop')) closeSheet(e.target.id);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    $all('.sheet-backdrop.open').forEach(function (el) { closeSheet(el.id); });
  });

  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' + esc(label || '처리 중'); }
    else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  }

  var STATUS_CLASS = { '확인중': 'pending', '확정': 'confirmed', '종료': 'done', '취소': 'canceled' };
  var STATUS_LABEL = { '확인중': '매니저 확인중', '확정': '확정', '종료': '종료', '취소': '취소됨' };
  function badge(status) {
    return '<span class="badge badge-' + (STATUS_CLASS[status] || 'pending') + '">' + esc(STATUS_LABEL[status] || status) + '</span>';
  }

  function initial(name) { return esc(String(name || '?').trim().charAt(0)); }
  function avatar(m, cls) {
    var c = 'avatar ' + (cls || '');
    if (m.photo && /^https:\/\//i.test(m.photo)) {
      return '<span class="' + c + '" data-initial="' + initial(m.name) + '"><img src="' + esc(m.photo) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></span>';
    }
    return '<span class="' + c + '" aria-hidden="true">' + initial(m.name) + '</span>';
  }

  // 사진을 못 불러오면 이름 첫 글자로 대신 표시
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (img && img.tagName === 'IMG' && img.parentNode && img.parentNode.hasAttribute('data-initial')) {
      img.parentNode.textContent = img.parentNode.getAttribute('data-initial');
    }
  }, true);

  function demoBanner() {
    if (!window.API || !API.isDemo) return;
    var b = document.createElement('div');
    b.className = 'demo-banner';
    b.innerHTML = '데모 모드 · 예시 데이터이며 실제로 저장되지 않습니다 <button type="button" class="link-btn">초기화</button>';
    b.querySelector('button').addEventListener('click', function () { API.resetDemo(); location.reload(); });
    document.body.prepend(b);
  }

  function applySettings(s) {
    if (!s) return;
    $all('[data-setting]').forEach(function (el) {
      var v = s[el.getAttribute('data-setting')];
      if (v) el.textContent = v;
    });
  }

  window.U = {
    $: $, $all: $all, esc: esc, fmtDate: fmtDate, dateParts: dateParts,
    bindPhoneInput: bindPhoneInput, bindDigits: bindDigits,
    validName: validName, validPhone: validPhone, validPin: validPin, setError: setError,
    toast: toast, openSheet: openSheet, closeSheet: closeSheet, setBusy: setBusy,
    badge: badge, avatar: avatar, demoBanner: demoBanner, applySettings: applySettings
  };
})();
