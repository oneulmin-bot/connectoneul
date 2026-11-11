/** 관리자: 로그인 / 신청 내역 / 시간 관리 / 매니저 소개 */
(function () {
  var $ = U.$, $all = U.$all, esc = U.esc;
  U.demoBanner();

  var TOKEN_KEY = 'connectoneul_admin';
  var session = null;
  var data = { managers: [], slots: [], apps: [], slotMinutes: 30 };
  var filter = { status: '확인중', manager: '' };

  function getSession() { try { return JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null'); } catch (e) { return null; } }
  function setSession(s) { try { s ? sessionStorage.setItem(TOKEN_KEY, JSON.stringify(s)) : sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } }

  /** 관리자 요청: 토큰을 붙이고, 만료되면 로그인 화면으로 */
  function adminCall(action, payload) {
    return API.call(action, Object.assign({ token: session && session.token }, payload || {})).catch(function (err) {
      if (err.code === 'AUTH') { logout(true); }
      throw err;
    });
  }

  // ── 로그인 ──
  API.call('public').then(function (d) {
    var sel = $('#who');
    d.managers.forEach(function (m) { var o = document.createElement('option'); o.value = m.name; o.textContent = m.name + ' 매니저'; sel.appendChild(o); });
  }).catch(function () { /* 목록이 없어도 '운영자'로 로그인 가능 */ });

  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var pw = $('#pw');
    if (!pw.value) { U.setError(pw, '비밀번호를 입력해 주세요.'); return; }
    U.setError(pw, '');
    var btn = $('#loginBtn');
    U.setBusy(btn, true, '확인 중');
    API.call('adminLogin', { password: pw.value, who: $('#who').value })
      .then(function (r) { session = r; setSession(r); pw.value = ''; enter(); })
      .catch(function (err) { U.setError(pw, err.message); })
      .then(function () { U.setBusy(btn, false); });
  });

  function logout(expired) {
    if (session && !expired) adminCall('adminLogout').catch(function () {});
    session = null; setSession(null);
    $('#adminView').hidden = true; $('#loginView').hidden = false; $('#logoutBtn').hidden = true;
    if (expired) U.toast('로그인이 만료되었습니다. 다시 로그인해 주세요.', 'error');
  }
  $('#logoutBtn').addEventListener('click', function () { logout(false); });

  function enter() {
    $('#loginView').hidden = true; $('#adminView').hidden = false; $('#logoutBtn').hidden = false;
    $('#whoLabel').textContent = session.who + ' 님';
    refresh();
  }

  function refresh() {
    $('#appList').innerHTML = '<div class="skeleton"></div>';
    return adminCall('adminData').then(function (d) {
      data = d;
      renderManagerSelects();
      renderApps();
      renderSlots();
      fillProfile();
    }).catch(function (err) {
      $('#appList').innerHTML = '<div class="state card"><b>불러오지 못했어요</b>' + esc(err.message) + '</div>';
    });
  }

  // ── 탭 ──
  $all('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      $all('.tab').forEach(function (x) { x.setAttribute('aria-selected', String(x === t)); });
      $all('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== t.getAttribute('data-tab'); });
    });
  });

  function managerName(id) { var m = data.managers.filter(function (x) { return x.id === id; })[0]; return m ? m.name : id; }

  function renderManagerSelects() {
    var opts = data.managers.map(function (m) { return '<option value="' + esc(m.id) + '">' + esc(m.name) + (m.visible ? '' : ' (숨김)') + '</option>'; }).join('');
    var keep = { app: $('#appManager').value, slot: $('#slotManager').value, pf: $('#pfSelect').value };
    $('#appManager').innerHTML = '<option value="">모든 매니저</option>' + opts;
    $('#slotManager').innerHTML = opts;
    $('#pfSelect').innerHTML = opts + '<option value="__new">+ 새 매니저 추가</option>';
    // 로그인한 사람이 매니저라면 기본으로 본인 선택
    var mine = data.managers.filter(function (m) { return m.name === session.who; })[0];
    $('#appManager').value = keep.app;
    $('#slotManager').value = keep.slot || (mine ? mine.id : (data.managers[0] && data.managers[0].id) || '');
    $('#pfSelect').value = keep.pf || (mine ? mine.id : (data.managers[0] && data.managers[0].id) || '__new');
    $all('.slotMin').forEach(function (el) { el.textContent = data.slotMinutes; });
  }

  // ── 신청 내역 ──
  function renderApps() {
    var pending = data.apps.filter(function (a) { return a.status === '확인중'; }).length;
    $('#pendingCount').hidden = !pending; $('#pendingCount').textContent = pending;

    var list = data.apps.filter(function (a) {
      return (!filter.status || a.status === filter.status) && (!filter.manager || a.managerId === filter.manager);
    });
    if (filter.status === '확인중' || filter.status === '확정') {
      list.sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); }); // 다가오는 순
    }
    if (!list.length) {
      $('#appList').innerHTML = '<div class="state card"><b>해당하는 신청이 없어요</b>' + (filter.status ? '‘' + esc(filter.status) + '’ 상태의 신청이 없습니다.' : '') + '</div>';
      return;
    }
    $('#appList').innerHTML = list.map(function (a) {
      var actions = [];
      if (a.status === '확인중') actions.push(btn('확정', '확정하기', 'btn-confirm'), btn('취소', '거절·취소', 'btn-cancel'));
      if (a.status === '확정') actions.push(btn('종료', '진행 완료(종료)', 'btn-done'), btn('취소', '취소', 'btn-cancel'));
      if (a.status === '종료') actions.push(btn('확정', '확정으로 되돌리기', 'btn-restore'));
      if (a.status === '취소') actions.push(btn('확인중', '확인중으로 되돌리기', 'btn-restore'));
      function btn(st, label, cls) { return '<button class="btn btn-sm ' + cls + '" data-act="status" data-status="' + st + '">' + label + '</button>'; }

      var tel = String(a.phone).replace(/\D/g, '');
      return '<article class="app-card card" data-id="' + esc(a.id) + '">' +
        '<div class="row"><div><div class="app-when">' + esc(U.fmtDate(a.date)) + ' ' + esc(a.start) + '</div>' +
        '<div class="app-mgr">' + esc(a.managerName || managerName(a.managerId)) + ' 매니저' + (a.past && a.status === '확정' ? ' · 시간 지남' : '') + '</div></div>' + U.badge(a.status) + '</div>' +
        '<div class="app-person"><b>' + esc(a.name) + '</b><a href="tel:' + esc(tel) + '">' + esc(a.phone) + '</a><a href="sms:' + esc(tel) + '">문자</a></div>' +
        (a.message ? '<p class="app-msg">💬 ' + esc(a.message) + '</p>' : '') +
        '<div class="app-meta">신청 ' + esc(String(a.appliedAt).slice(0, 16)) + (a.handledBy ? ' · 처리 ' + esc(a.handledBy) + ' ' + esc(String(a.handledAt).slice(5, 16)) : '') + '</div>' +
        '<div class="app-actions">' + actions.join('') + '</div>' +
        '<div class="memo-row"><input class="input" maxlength="500" placeholder="메모 (예: 11/10 문자 발송 완료)" value="' + esc(a.memo) + '">' +
        '<button class="btn btn-sm btn-line" data-act="memo">저장</button></div>' +
      '</article>';
    }).join('');
  }

  $('#statusFilters').addEventListener('click', function (e) {
    var c = e.target.closest('.filter-chip'); if (!c) return;
    filter.status = c.getAttribute('data-status');
    $all('.filter-chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); });
    renderApps();
  });
  $('#appManager').addEventListener('change', function () { filter.manager = this.value; renderApps(); });

  var CONFIRM_MSG = {
    '확정': '이 신청을 확정할까요?\n확정 후 신청자에게 직접 연락해 주세요.',
    '취소': '이 신청을 취소(거절)할까요?\n시간이 남아 있으면 해당 시간은 다시 신청 가능 상태로 열립니다.',
    '종료': '커피챗을 진행 완료(종료)로 바꿀까요?',
    '확인중': '확인중 상태로 되돌릴까요?'
  };
  $('#appList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var card = b.closest('.app-card'); var id = card.getAttribute('data-id');
    var payload = { appId: id };
    if (b.getAttribute('data-act') === 'status') {
      var st = b.getAttribute('data-status');
      if (!confirm(CONFIRM_MSG[st])) return;
      payload.status = st;
    } else {
      payload.memo = card.querySelector('.memo-row .input').value;
    }
    U.setBusy(b, true, '');
    adminCall('adminUpdateApp', payload)
      .then(function () { U.toast(payload.status ? '‘' + payload.status + '’ 상태로 바꿨어요.' : '메모를 저장했어요.', 'success'); return refresh(); })
      .catch(function (err) { U.toast(err.message, 'error'); U.setBusy(b, false); });
  });

  // ── 시간 관리 ──
  (function initTimeSelects() {
    var opts = '';
    for (var m = 7 * 60; m <= 22 * 60; m += 30) {
      var t = ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
      opts += '<option>' + t + '</option>';
    }
    $('#slotStart').innerHTML = opts; $('#slotEnd').innerHTML = opts;
    $('#slotStart').value = '10:00'; $('#slotEnd').value = '12:00';
    var d = new Date(); d.setDate(d.getDate() + 1);
    var pad = function (n) { return ('0' + n).slice(-2); };
    $('#slotDate').value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    $('#slotDate').min = new Date().toISOString().slice(0, 10);
  })();

  function toMin(t) { var p = t.split(':'); return +p[0] * 60 + +p[1]; }
  function updatePreview() {
    var n = Math.floor((toMin($('#slotEnd').value) - toMin($('#slotStart').value)) / (data.slotMinutes || 30));
    $('#slotPreview').textContent = n > 0 ? (data.slotMinutes || 30) + '분 × ' + n + '타임이 만들어져요' : '종료 시간을 시작 시간보다 뒤로 선택해 주세요';
  }
  ['#slotStart', '#slotEnd'].forEach(function (s) { $(s).addEventListener('change', updatePreview); });
  $('#slotManager').addEventListener('change', renderSlots);
  updatePreview();

  $('#slotForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('#slotAddBtn');
    U.setBusy(btn, true, '추가 중');
    adminCall('adminAddSlots', { managerId: $('#slotManager').value, date: $('#slotDate').value, start: $('#slotStart').value, end: $('#slotEnd').value })
      .then(function (r) { U.toast(r.added + '개 시간을 추가했어요' + (r.skipped ? ' (이미 있는 ' + r.skipped + '개 제외)' : ''), 'success'); return refresh(); })
      .catch(function (err) { U.toast(err.message, 'error'); })
      .then(function () { U.setBusy(btn, false); });
  });

  var showDeleted = false;
  function renderSlots() {
    var mid = $('#slotManager').value;
    var today = new Date(); var pad = function (n) { return ('0' + n).slice(-2); };
    var todayStr = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
    var all = data.slots.filter(function (s) { return s.managerId === mid && s.date >= todayStr; });
    var deleted = all.filter(function (s) { return s.status === '닫힘'; }).length;
    var list = showDeleted ? all : all.filter(function (s) { return s.status !== '닫힘'; });
    var toggle = deleted ? '<button type="button" class="link-btn slot-toggle" data-toggle-deleted>' +
      (showDeleted ? '삭제한 시간 숨기기' : '삭제한 시간 ' + deleted + '개 보기') + '</button>' : '';
    if (!list.length) { $('#slotList').innerHTML = '<div class="state"><b>등록된 시간이 없어요</b>위에서 시간을 추가해 주세요.</div>' + toggle; return; }
    var g = {};
    list.forEach(function (s) { (g[s.date] = g[s.date] || []).push(s); });
    var LABEL = { '가능': '', '대기': '<small>신청됨</small>', '확정': '<small>확정</small>', '닫힘': '<small>삭제됨</small>' };
    $('#slotList').innerHTML = Object.keys(g).sort().map(function (d) {
      return '<div class="slot-day"><h3>' + esc(U.fmtDate(d)) + '</h3><div class="slot-chips">' + g[d].map(function (s) {
        var act = s.status === '가능' ? '<button data-slot="' + esc(s.id) + '" data-to="닫힘" aria-label="' + esc(s.start) + ' 삭제">삭제</button>'
                : s.status === '닫힘' ? '<button data-slot="' + esc(s.id) + '" data-to="가능">되살리기</button>' : '';
        return '<span class="slot-chip s-' + esc(s.status) + '">' + esc(s.start) + ' ' + (LABEL[s.status] || '') + act + '</span>';
      }).join('') + '</div></div>';
    }).join('') + toggle;
  }

  $('#slotList').addEventListener('click', function (e) {
    if (e.target.closest('[data-toggle-deleted]')) { showDeleted = !showDeleted; renderSlots(); return; }
    var b = e.target.closest('button[data-slot]'); if (!b) return;
    var to = b.getAttribute('data-to');
    b.disabled = true;
    adminCall('adminSetSlot', { slotId: b.getAttribute('data-slot'), status: to })
      .then(function () { U.toast(to === '닫힘' ? '시간을 삭제했어요. 홈페이지에서도 사라져요.' : '시간을 되살렸어요.', 'success'); return refresh(); })
      .catch(function (err) { U.toast(err.message, 'error'); b.disabled = false; });
  });

  // ── 매니저 소개 ──
  function fillProfile() {
    var id = $('#pfSelect').value;
    var m = data.managers.filter(function (x) { return x.id === id; })[0] || { name: '', oneLine: '', detail: '', topics: [], photo: '', visible: false, order: data.managers.length + 1 };
    $('#pfName').value = m.name; $('#pfOne').value = m.oneLine; $('#pfDetail').value = m.detail;
    $('#pfTopics').value = (m.topics || []).join(', '); $('#pfPhoto').value = m.photo || ''; $('#pfEmail').value = m.email || '';
    $('#pfOrder').value = m.order === 999 ? '' : m.order; $('#pfVisible').checked = !!m.visible;
    // 서버(Apps Script)가 예전 버전이면 이메일 항목 자체가 오지 않음 → 안내
    var old = data.managers.length && !('email' in data.managers[0]);
    $('#pfEmailWarn').hidden = !old;
    $('#pfEmail').disabled = old;
  }
  $('#pfSelect').addEventListener('change', fillProfile);

  $('#profileForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = $('#pfSelect').value;
    var manager = {
      id: id === '__new' ? '' : id,
      name: $('#pfName').value.trim(), oneLine: $('#pfOne').value.trim(), detail: $('#pfDetail').value.trim(),
      topics: $('#pfTopics').value.split(/[,，]/).map(function (t) { return t.replace(/^#/, '').trim(); }).filter(Boolean),
      photo: $('#pfPhoto').value.trim(), email: $('#pfEmail').value.trim(), order: $('#pfOrder').value, visible: $('#pfVisible').checked
    };
    if (!manager.name) { U.toast('이름을 입력해 주세요.', 'error'); return; }
    var btn = $('#pfSaveBtn');
    U.setBusy(btn, true, '저장 중');
    adminCall('adminSaveManager', { manager: manager })
      .then(function (r) {
        $('#pfSelect').value = r.id;
        return refresh().then(function () {
          $('#pfSelect').value = r.id; fillProfile();
          var saved = data.managers.filter(function (x) { return x.id === r.id; })[0] || {};
          if (manager.email && saved.email !== manager.email) {
            U.toast('소개는 저장됐지만 이메일은 저장되지 않았어요. Apps Script를 새 버전으로 배포해 주세요.', 'error');
          } else {
            U.toast('저장했어요.', 'success');
          }
        });
      })
      .catch(function (err) { U.toast(err.message, 'error'); })
      .then(function () { U.setBusy(btn, false); });
  });

  // 새로고침해도 로그인 유지 (브라우저 탭을 닫으면 해제)
  session = getSession();
  if (session && session.token) enter();
})();
