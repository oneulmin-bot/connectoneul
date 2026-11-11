/** 전체 타임 보기: 달력에서 날짜를 고르면 그날의 시간대와 가능한 매니저를 보여 줌 */
(function () {
  var $ = U.$, esc = U.esc;
  U.demoBanner();

  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  var data = null;
  var managers = {};
  var only = '';        // 선택한 매니저ID ('' = 전체)
  var byDate = {};      // 'YYYY-MM-DD' → 신청 가능 슬롯 목록
  var selected = '';    // 선택한 날짜
  var month = null;     // 보고 있는 달 (그 달 1일의 Date)

  function pad(n) { return ('0' + n).slice(-2); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function monthOf(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, 1); }
  function sameMonth(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }
  var today = ymd(new Date());
  var thisMonth = monthOf(today);

  function buildIndex() {
    byDate = {};
    data.slots.forEach(function (s) {
      if (!s.available || !managers[s.managerId] || (only && s.managerId !== only)) return;
      (byDate[s.date] = byDate[s.date] || []).push(s);
    });
  }
  function dates() { return Object.keys(byDate).sort(); }

  /** 선택한 날짜가 없거나 비었으면 가장 빠른 신청 가능 날짜로 */
  function ensureSelection() {
    if (!byDate[selected]) selected = dates()[0] || '';
    if (selected) month = monthOf(selected);
    else if (!month) month = thisMonth;
  }

  // ── 달력 ──
  function renderCalendar() {
    var all = dates();
    var lastMonth = all.length ? monthOf(all[all.length - 1]) : thisMonth;
    var canPrev = month > thisMonth;
    var canNext = month < lastMonth;
    var first = new Date(month.getFullYear(), month.getMonth(), 1);
    var days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

    var cells = '';
    for (var i = 0; i < first.getDay(); i++) cells += '<span class="cal-cell empty"></span>';
    for (var d = 1; d <= days; d++) {
      var date = new Date(month.getFullYear(), month.getMonth(), d);
      var key = ymd(date);
      var has = !!byDate[key];
      var cls = 'cal-cell' + (has ? ' has' : '') + (key < today ? ' past' : '') + (key === today ? ' today' : '') +
                (date.getDay() === 0 ? ' sun' : date.getDay() === 6 ? ' sat' : '');
      var label = (month.getMonth() + 1) + '월 ' + d + '일' + (has ? ', 신청 가능 ' + byDate[key].length + '타임' : ', 가능한 시간 없음');
      cells += '<button type="button" class="' + cls + '" data-date="' + key + '"' + (has ? '' : ' disabled') +
               ' aria-pressed="' + (key === selected) + '" aria-label="' + label + '"><span class="n">' + d + '</span></button>';
    }

    $('#calendar').innerHTML =
      '<div class="cal-head">' +
        '<button type="button" class="cal-nav" data-move="-1" aria-label="이전 달"' + (canPrev ? '' : ' disabled') + '>‹</button>' +
        '<h2>' + month.getFullYear() + '년 ' + (month.getMonth() + 1) + '월</h2>' +
        '<button type="button" class="cal-nav" data-move="1" aria-label="다음 달"' + (canNext ? '' : ' disabled') + '>›</button>' +
      '</div>' +
      '<div class="cal-grid cal-dow">' + DOW.map(function (w, i) {
        return '<span class="' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + w + '</span>';
      }).join('') + '</div>' +
      '<div class="cal-grid">' + cells + '</div>' +
      '<div class="cal-legend"><span><i></i>신청 가능</span><span class="muted">흐린 날짜는 열린 시간이 없어요</span></div>';
  }

  // ── 선택한 날짜의 시간 목록 ──
  function renderDay() {
    var box = $('#dayList');
    if (!data.settings.open) {
      box.innerHTML = '<div class="state card"><b>지금은 신청을 받고 있지 않아요</b>신청이 다시 열리면 이용해 주세요.</div>';
      return;
    }
    if (!selected) {
      box.innerHTML = '<div class="state card"><b>지금 신청할 수 있는 시간이 없어요</b>' +
        (only ? '다른 매니저를 선택해 보세요.' : '매니저가 시간을 올리면 달력에 표시돼요.') + '</div>';
      return;
    }
    var times = {};
    byDate[selected].forEach(function (s) { (times[s.start] = times[s.start] || []).push(s); });

    box.innerHTML = '<section class="tl-day card">' +
      '<h2><span>' + esc(U.fmtDate(selected)) + '</span><span class="tl-count">' + byDate[selected].length + '타임</span></h2>' +
      Object.keys(times).sort().map(function (t) {
        return '<div class="tl-row"><div class="tl-time">' + esc(t) + '</div><div class="tl-mgrs">' +
          times[t].map(function (s) {
            var m = managers[s.managerId];
            return '<a class="tl-mgr" href="manager.html?id=' + encodeURIComponent(m.id) + '&slot=' + encodeURIComponent(s.id) + '">' +
              U.avatar(m, 'xs') + '<span>' + esc(m.name) + '</span></a>';
          }).join('') +
        '</div></div>';
      }).join('') +
    '</section>';
  }

  // ── 매니저 필터 ──
  function renderFilter() {
    var count = {};
    data.slots.forEach(function (s) { if (s.available && managers[s.managerId]) count[s.managerId] = (count[s.managerId] || 0) + 1; });
    var chips = [{ id: '', name: '전체' }].concat(data.managers.filter(function (m) { return count[m.id]; }));
    if (chips.length <= 2) { $('#managerFilter').hidden = true; return; }
    $('#managerFilter').innerHTML = chips.map(function (m) {
      return '<button type="button" class="filter-chip" data-id="' + esc(m.id) + '" aria-pressed="' + (m.id === only) + '">' +
        esc(m.name) + (m.id ? ' <small>' + count[m.id] + '</small>' : '') + '</button>';
    }).join('');
  }

  function renderAll() { renderFilter(); renderCalendar(); renderDay(); }

  $('#managerFilter').addEventListener('click', function (e) {
    var b = e.target.closest('.filter-chip'); if (!b) return;
    only = b.getAttribute('data-id');
    buildIndex(); ensureSelection(); renderAll();
  });

  $('#calendar').addEventListener('click', function (e) {
    var nav = e.target.closest('.cal-nav');
    if (nav && !nav.disabled) {
      month = new Date(month.getFullYear(), month.getMonth() + Number(nav.getAttribute('data-move')), 1);
      // 새 달에 신청 가능한 날이 있으면 그 첫날을 선택
      var inMonth = dates().filter(function (d) { return sameMonth(monthOf(d), month); });
      if (inMonth.length) selected = inMonth[0];
      renderCalendar(); renderDay();
      return;
    }
    var cell = e.target.closest('.cal-cell.has');
    if (!cell) return;
    selected = cell.getAttribute('data-date');
    renderCalendar(); renderDay();
    var list = $('#dayList');
    if (list.getBoundingClientRect().top > window.innerHeight - 160) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  API.call('public').then(function (d) {
    data = d;
    data.managers.forEach(function (m) { managers[m.id] = m; });
    U.applySettings(d.settings);
    buildIndex(); ensureSelection(); renderAll();
  }).catch(function (err) {
    $('#calendar').innerHTML = '<div class="state"><b>시간을 불러오지 못했어요</b>' + esc(err.message) +
      '<br><br><button class="btn btn-line btn-sm" onclick="location.reload()">다시 시도</button></div>';
  });
})();
