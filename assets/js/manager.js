/** 매니저 상세 + 시간 선택 + 신청 */
(function () {
  var $ = U.$, esc = U.esc;
  U.demoBanner();

  var managerId = new URLSearchParams(location.search).get('id') || '';
  var state = { manager: null, slots: [], date: null, slot: null };

  function load() {
    return API.call('public').then(function (data) {
      U.applySettings(data.settings);
      $('#slotMin').textContent = data.settings.slotMinutes || 30;
      state.open = data.settings.open !== false;
      state.manager = data.managers.filter(function (m) { return m.id === managerId; })[0] || null;
      state.slots = data.slots.filter(function (s) { return s.managerId === managerId; });
      if (!state.manager) {
        $('#profile').innerHTML = '<div class="state"><b>매니저를 찾을 수 없어요</b>목록에서 다시 선택해 주세요.<br><br><a class="btn btn-glass btn-sm" href="./">매니저 목록</a></div>';
        return;
      }
      document.title = state.manager.name + ' 매니저 커피챗 · connect 오늘';
      renderProfile();
      renderPicker();
    }).catch(function (err) {
      $('#profile').innerHTML = '<div class="state"><b>정보를 불러오지 못했어요</b>' + esc(err.message) + '<br><br><button class="btn btn-glass btn-sm" onclick="location.reload()">다시 시도</button></div>';
    });
  }

  function renderProfile() {
    var m = state.manager;
    $('#profile').innerHTML =
      '<div class="profile-head">' + U.avatar(m, 'lg') +
      '<div><h1>' + esc(m.name) + ' <small style="font-size:14px;color:var(--ink-3)">매니저</small></h1>' +
      '<div class="mc-line">' + esc(m.oneLine) + '</div></div></div>' +
      (m.topics.length ? '<div class="tags">' + m.topics.map(function (t) { return '<span class="tag">#' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
      (m.detail ? '<p class="profile-detail">' + esc(m.detail) + '</p>' : '');
  }

  function groupByDate() {
    var g = {};
    state.slots.forEach(function (s) { (g[s.date] = g[s.date] || []).push(s); });
    return g;
  }

  function renderPicker() {
    $('#picker').hidden = false;
    $('#actionBar').hidden = false;
    var groups = groupByDate();
    var dates = Object.keys(groups).sort();

    if (!state.open) {
      $('#dates').innerHTML = '';
      $('#times').innerHTML = '<div class="state" style="grid-column:1/-1"><b>지금은 신청을 받고 있지 않아요</b>신청이 다시 열리면 이용해 주세요.</div>';
      $('#actionBar').hidden = true;
      return;
    }
    if (!dates.length) {
      $('#dates').innerHTML = '';
      $('#times').innerHTML = '<div class="state" style="grid-column:1/-1"><b>아직 열린 시간이 없어요</b>매니저가 시간을 올리면 이곳에 표시됩니다.</div>';
      $('#actionBar').hidden = true;
      return;
    }
    // 처음엔 신청 가능한 첫 날짜 선택
    if (!state.date || !groups[state.date]) {
      state.date = dates.filter(function (d) { return groups[d].some(function (s) { return s.available; }); })[0] || dates[0];
    }

    $('#dates').innerHTML = dates.map(function (d) {
      var p = U.dateParts(d);
      var n = groups[d].filter(function (s) { return s.available; }).length;
      var cls = 'date-btn' + (p.day === 0 ? ' sun' : p.day === 6 ? ' sat' : '') + (n ? '' : ' full');
      return '<button type="button" class="' + cls + '" data-date="' + esc(d) + '" aria-pressed="' + (d === state.date) + '">' +
        '<span class="dow">' + p.dow + '</span><span class="md">' + p.md + '</span><span class="cnt">' + (n ? n + '타임' : '마감') + '</span></button>';
    }).join('');
    renderTimes(groups[state.date] || []);
  }

  function renderTimes(list) {
    $('#times').innerHTML = list.map(function (s) {
      var sel = state.slot && state.slot.id === s.id;
      return '<button type="button" class="time-btn" data-slot="' + esc(s.id) + '"' + (s.available ? '' : ' disabled aria-label="' + esc(s.start) + ' 마감"') +
        ' aria-pressed="' + !!sel + '">' + esc(s.start) + '</button>';
    }).join('');
  }

  function updateBar() {
    var s = state.slot;
    $('#actionSel').innerHTML = s ? '선택한 시간<b>' + esc(U.fmtDate(s.date)) + ' ' + esc(s.start) + '–' + esc(s.end) + '</b>' : '시간을 선택해 주세요<b>—</b>';
    $('#openApply').disabled = !s;
  }

  function summaryHtml(m, s) {
    return U.avatar(m) + '<div><b>' + esc(m.name) + ' 매니저</b><span>' + esc(U.fmtDate(s.date)) + ' · ' + esc(s.start) + '–' + esc(s.end) + '</span></div>';
  }

  $('#dates').addEventListener('click', function (e) {
    var b = e.target.closest('.date-btn'); if (!b) return;
    state.date = b.getAttribute('data-date');
    state.slot = null; updateBar(); renderPicker();
  });
  $('#times').addEventListener('click', function (e) {
    var b = e.target.closest('.time-btn'); if (!b || b.disabled) return;
    var id = b.getAttribute('data-slot');
    state.slot = state.slots.filter(function (s) { return s.id === id; })[0];
    renderTimes(groupByDate()[state.date]); updateBar();
  });
  $('#openApply').addEventListener('click', function () {
    if (!state.slot) return;
    $('#applySummary').innerHTML = summaryHtml(state.manager, state.slot);
    U.openSheet('applySheet');
  });

  // ── 신청서 ──
  var name = $('#apName'), phone = $('#apPhone'), pin = $('#apPin'), msg = $('#apMsg'), agree = $('#apAgree');
  U.bindPhoneInput(phone);
  U.bindDigits(pin, 4);
  agree.addEventListener('change', function () { if (agree.checked) $('#agreeError').textContent = ''; });

  $('#applyForm').addEventListener('submit', function (e) {
    e.preventDefault();
    U.setError(name, U.validName(name.value) ? '' : '이름을 2~20자로 입력해 주세요.');
    U.setError(phone, U.validPhone(phone.value) ? '' : '연락처를 010-0000-0000 형식으로 입력해 주세요.');
    U.setError(pin, U.validPin(pin.value) ? '' : '숫자 4자리를 입력해 주세요.');
    $('#agreeError').textContent = agree.checked ? '' : '개인정보 수집·이용 동의가 필요합니다.';
    var firstErr = document.querySelector('#applyForm .has-error .input');
    if (firstErr) { firstErr.focus(); return; }
    if (!agree.checked) return;

    var btn = $('#applyBtn');
    var slot = state.slot;
    U.setBusy(btn, true, '신청 중');
    API.call('apply', { slotId: slot.id, name: name.value.trim(), phone: phone.value, pin: pin.value, message: msg.value.trim(), agree: true })
      .then(function (r) {
        U.closeSheet('applySheet');
        $('#doneSummary').innerHTML = summaryHtml(state.manager, { date: r.date, start: r.start, end: r.end });
        $('#bookView').hidden = true;
        $('#actionBar').hidden = true;
        $('#doneView').hidden = false;
        window.scrollTo(0, 0);
      })
      .catch(function (err) {
        U.toast(err.message, 'error');
        if (err.code === 'SLOT_TAKEN' || err.code === 'SLOT_GONE') {
          U.closeSheet('applySheet');
          state.slot = null; updateBar(); load();
        }
      })
      .then(function () { U.setBusy(btn, false); });
  });

  load();
})();
