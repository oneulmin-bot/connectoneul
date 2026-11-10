/** 전체 타임 보기: 모든 매니저의 신청 가능 시간을 날짜·시간별로 */
(function () {
  var $ = U.$, esc = U.esc;
  U.demoBanner();

  var data = null;
  var only = ''; // 선택한 매니저ID ('' = 전체)

  function render() {
    var managers = {};
    data.managers.forEach(function (m) { managers[m.id] = m; });
    var list = data.slots.filter(function (s) { return s.available && managers[s.managerId] && (!only || s.managerId === only); });

    if (!data.settings.open) {
      $('#timeline').innerHTML = '<div class="state card"><b>지금은 신청을 받고 있지 않아요</b>신청이 다시 열리면 이용해 주세요.</div>';
      return;
    }
    if (!list.length) {
      $('#timeline').innerHTML = '<div class="state card"><b>지금 신청할 수 있는 시간이 없어요</b>' +
        (only ? '다른 매니저를 선택해 보세요.' : '매니저가 시간을 올리면 이곳에 모여요.') + '</div>';
      return;
    }

    // 날짜 → 시작시간 → 슬롯들
    var byDate = {};
    list.forEach(function (s) {
      var d = byDate[s.date] = byDate[s.date] || {};
      (d[s.start] = d[s.start] || []).push(s);
    });

    $('#timeline').innerHTML = Object.keys(byDate).sort().map(function (date) {
      var times = byDate[date];
      var count = Object.keys(times).reduce(function (n, t) { return n + times[t].length; }, 0);
      var p = U.dateParts(date);
      return '<section class="tl-day card">' +
        '<h2><span class="tl-date' + (p.day === 0 ? ' sun' : p.day === 6 ? ' sat' : '') + '">' + esc(U.fmtDate(date)) + '</span>' +
        '<span class="tl-count">' + count + '타임</span></h2>' +
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
    }).join('');
  }

  function renderFilter() {
    var withSlots = {};
    data.slots.forEach(function (s) { if (s.available) withSlots[s.managerId] = (withSlots[s.managerId] || 0) + 1; });
    var chips = [{ id: '', name: '전체' }].concat(data.managers.filter(function (m) { return withSlots[m.id]; }));
    if (chips.length <= 2) { $('#managerFilter').hidden = true; return; }
    $('#managerFilter').innerHTML = chips.map(function (m) {
      return '<button type="button" class="filter-chip" data-id="' + esc(m.id) + '" aria-pressed="' + (m.id === only) + '">' +
        esc(m.name) + (m.id ? ' <small>' + withSlots[m.id] + '</small>' : '') + '</button>';
    }).join('');
  }

  $('#managerFilter').addEventListener('click', function (e) {
    var b = e.target.closest('.filter-chip'); if (!b) return;
    only = b.getAttribute('data-id');
    renderFilter(); render();
  });

  API.call('public').then(function (d) {
    data = d;
    U.applySettings(d.settings);
    renderFilter(); render();
  }).catch(function (err) {
    $('#timeline').innerHTML = '<div class="state card"><b>시간을 불러오지 못했어요</b>' + esc(err.message) +
      '<br><br><button class="btn btn-line btn-sm" onclick="location.reload()">다시 시도</button></div>';
  });
})();
