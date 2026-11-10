/** 홈: 매니저 목록 + 내 신청 확인 */
(function () {
  var $ = U.$, esc = U.esc;
  U.demoBanner();

  // ── 매니저 목록 ──
  function renderManagers(data) {
    var grid = $('#managerGrid');
    var counts = {};
    data.slots.forEach(function (s) { if (s.available) counts[s.managerId] = (counts[s.managerId] || 0) + 1; });

    if (!data.managers.length) {
      grid.innerHTML = '<div class="state card" style="grid-column:1/-1"><b>곧 매니저가 소개될 예정이에요</b>조금만 기다려 주세요.</div>';
      return;
    }
    $('#managerCount').textContent = data.managers.length + '명';
    grid.innerHTML = data.managers.map(function (m) {
      var n = counts[m.id] || 0;
      return '<a class="manager-card card" href="manager.html?id=' + encodeURIComponent(m.id) + '">' +
        '<div class="mc-top">' + U.avatar(m) +
          '<div><div class="mc-name">' + esc(m.name) + '<small>매니저</small></div>' +
          '<div class="mc-line">' + esc(m.oneLine) + '</div></div></div>' +
        (m.topics.length ? '<div class="tags">' + m.topics.map(function (t) { return '<span class="tag">#' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
        '<div class="mc-foot"><span class="mc-count' + (n ? '' : ' none') + '">' + (n ? '신청 가능 ' + n + '타임' : '현재 열린 시간 없음') + '</span>' +
        '<span class="mc-arrow" aria-hidden="true">→</span></div>' +
      '</a>';
    }).join('');
  }

  API.call('public').then(function (data) {
    U.applySettings(data.settings);
    renderManagers(data);
  }).catch(function (err) {
    $('#managerGrid').innerHTML = '<div class="state card" style="grid-column:1/-1"><b>매니저 정보를 불러오지 못했어요</b>' + esc(err.message) +
      '<br><br><button class="btn btn-line btn-sm" onclick="location.reload()">다시 시도</button></div>';
  });

  // ── 내 신청 확인 ──
  var form = $('#lookupForm');
  var name = $('#lkName'), phone = $('#lkPhone'), pin = $('#lkPin');
  U.bindPhoneInput(phone);
  U.bindDigits(pin, 4);

  $('#openLookup').addEventListener('click', function () { U.openSheet('lookupSheet'); });
  if (location.hash === '#my') U.openSheet('lookupSheet');
  // 홈에서 상단 '내 신청 확인'을 누르면 페이지 이동 없이 바로 열기
  var navMy = document.querySelector('.tabbar [data-nav="my"]');
  if (navMy) navMy.addEventListener('click', function (e) { e.preventDefault(); U.openSheet('lookupSheet'); });

  $('#lookupAgain').addEventListener('click', function () {
    $('#lookupResult').hidden = true; form.hidden = false; pin.value = ''; pin.focus();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var okAll = true;
    U.setError(name, U.validName(name.value) ? '' : '이름을 2~20자로 입력해 주세요.') ;
    U.setError(phone, U.validPhone(phone.value) ? '' : '연락처를 010-0000-0000 형식으로 입력해 주세요.');
    U.setError(pin, U.validPin(pin.value) ? '' : '숫자 4자리를 입력해 주세요.');
    [name, phone, pin].forEach(function (i) { if (i.closest('.field').classList.contains('has-error')) okAll = false; });
    if (!okAll) return;

    var btn = $('#lookupBtn');
    U.setBusy(btn, true, '조회 중');
    API.call('lookup', { name: name.value.trim(), phone: phone.value, pin: pin.value })
      .then(function (data) {
        $('#myList').innerHTML = data.items.map(function (it) {
          return '<div class="my-item"><div class="row"><b>' + esc(it.managerName) + ' 매니저</b>' + U.badge(it.status) + '</div>' +
            '<div class="when">' + esc(U.fmtDate(it.date)) + ' · ' + esc(it.start) + '–' + esc(it.end) + '</div>' +
            '<div class="sub">신청일 ' + esc(String(it.appliedAt).slice(0, 16)) + '</div></div>';
        }).join('');
        form.hidden = true;
        $('#lookupResult').hidden = false;
      })
      .catch(function (err) { U.toast(err.message, 'error'); })
      .then(function () { U.setBusy(btn, false); });
  });
})();
