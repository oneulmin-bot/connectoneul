/**
 * 서버(Apps Script 웹앱)와 통신합니다.
 * config.js 의 API_URL 이 비어 있으면 브라우저 안에서만 동작하는 데모 서버를 씁니다.
 */
(function () {
  var cfg = window.APP_CONFIG || {};
  var API_URL = (cfg.API_URL || '').trim();
  var DEMO = !API_URL;

  function request(action, payload) {
    if (DEMO) return Promise.resolve(Demo.handle(action, payload || {}));
    var opts;
    if (action === 'public') {
      return fetch(API_URL + '?action=public', { method: 'GET', redirect: 'follow' }).then(parse);
    }
    // text/plain 으로 보내야 브라우저의 사전 요청(CORS preflight) 없이 Apps Script 가 받습니다.
    opts = {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    };
    return fetch(API_URL, opts).then(parse);
  }

  function parse(res) {
    if (!res.ok) throw new Error('네트워크 오류 (' + res.status + ')');
    return res.json();
  }

  /** 성공이면 data 반환, 실패면 message 를 가진 Error 를 던집니다. */
  function call(action, payload) {
    return request(action, payload).then(function (r) {
      if (r && r.ok) return r.data;
      var e = new Error((r && r.message) || '요청을 처리하지 못했습니다.');
      e.code = r && r.code;
      throw e;
    }, function (err) {
      var e = new Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
      e.cause = err;
      throw e;
    });
  }

  // ───────────── 데모 서버 (실제 데이터 아님) ─────────────
  var Demo = (function () {
    var KEY = 'connectoneul_demo_v1';
    var DEMO_PW = 'demo1234';
    var SLOT_MIN = 30;

    function pad(n) { return ('0' + n).slice(-2); }
    function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function nowStr() { var d = new Date(); return ymd(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    function rid(n) { return Math.random().toString(36).slice(2, 2 + n).toUpperCase(); }
    function toMin(t) { var p = t.split(':'); return +p[0] * 60 + +p[1]; }
    function fromMin(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }

    function seed() {
      var managers = [
        { id: 'M01', name: '김하늘', oneLine: '비영리 10년차, 기획과 운영 이야기를 나눠요', detail: '청년 프로그램을 기획·운영해 왔습니다. 첫 직장 고민, 비영리 커리어가 궁금하다면 편하게 신청해 주세요.', topics: ['진로', '비영리', '기획'], photo: '', visible: true, order: 1 },
        { id: 'M02', name: '이바다', oneLine: '마케팅과 브랜딩, 작게 시작하는 법', detail: '작은 조직에서 홍보·브랜딩을 맡고 있어요. SNS 운영, 콘텐츠 기획 고민을 함께 풀어봐요.', topics: ['마케팅', '브랜딩', 'SNS'], photo: '', visible: true, order: 2 },
        { id: 'M03', name: '박숲', oneLine: '사회적기업 창업, 실패담부터 들려드려요', detail: '두 번의 창업 경험이 있습니다. 아이디어 검증, 초기 팀 꾸리기, 지원사업 활용법을 이야기해요.', topics: ['창업', '사회적기업', '지원사업'], photo: '', visible: true, order: 3 },
        { id: 'M04', name: '최노을', oneLine: '데이터로 일하는 법, 엑셀부터 차근차근', detail: '현장 데이터를 정리하고 성과를 보여주는 일을 합니다. 성과관리, 보고서 작성 팁을 나눠요.', topics: ['데이터', '성과관리', '보고서'], photo: '', visible: true, order: 4 },
        { id: 'M05', name: '정별', oneLine: '사람과 조직, 함께 일하는 문화를 고민해요', detail: '조직문화와 인사를 담당하고 있어요. 이직, 협업, 커뮤니케이션 고민을 들려주세요.', topics: ['조직문화', '이직', '커뮤니케이션'], photo: '', visible: true, order: 5 }
      ];
      var slots = [];
      var base = new Date();
      for (var d = 1, made = 0; made < 6 && d < 20; d++) {
        var day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + d);
        if (day.getDay() === 0 || day.getDay() === 6) continue;
        made++;
        managers.forEach(function (m, i) {
          if ((made + i) % 2) return;
          var startH = 10 + ((i * 2 + made) % 8);
          for (var k = 0; k < 3; k++) {
            var s = startH * 60 + k * 30;
            slots.push({ id: 'S' + rid(8), managerId: m.id, date: ymd(day), start: fromMin(s), end: fromMin(s + 30),
                         status: (k === 1 && i % 2 === 0) ? '대기' : '가능' });
          }
        });
      }
      return { managers: managers, slots: slots, apps: [], tokens: {} };
    }

    function load() {
      try { var raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) { /* ignore */ }
      var db = seed(); save(db); return db;
    }
    function save(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ } }
    function ok(data) { return { ok: true, data: data }; }
    function fail(message, code) { return { ok: false, message: message, code: code || '' }; }
    function cleanPhone(v) {
      var d = String(v || '').replace(/\D/g, '');
      if (!/^01[016789]\d{7,8}$/.test(d)) return '';
      return d.length === 11 ? d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7) : d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    }
    function cleanName(v) { var s = String(v || '').replace(/\s+/g, ' ').trim(); return s.length >= 2 && s.length <= 20 ? s : ''; }
    function find(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
    function auth(db, p) { return db.tokens[p.token]; }

    var settings = {
      orgName: cfg.ORG_NAME || '사단법인 오늘은',
      place: '공덕역 인근 (상세 장소는 매니저가 확정 연락 시 안내)',
      intro: '관심 있는 매니저를 골라 30분 커피챗을 신청해 보세요.',
      doneMessage: '신청이 접수되었습니다. 매니저가 확인한 뒤 남겨주신 연락처로 확정 연락을 드립니다.',
      retention: '커피챗 종료 후 6개월',
      open: true,
      kakao: '',
      slotMinutes: SLOT_MIN
    };

    function handle(action, p) {
      var db = load();
      var now = nowStr();
      var today = now.slice(0, 10);
      var r;
      switch (action) {
        case 'public': {
          var vis = {};
          var ms = db.managers.filter(function (m) { return m.visible; }).sort(function (a, b) { return a.order - b.order; });
          ms.forEach(function (m) { vis[m.id] = true; });
          var sl = db.slots.filter(function (s) { return vis[s.managerId] && s.date >= today && s.status !== '닫힘'; })
            .map(function (s) { return { id: s.id, managerId: s.managerId, date: s.date, start: s.start, end: s.end, available: s.status === '가능' && (s.date + ' ' + s.start) > now }; })
            .sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); });
          return ok({ settings: settings, managers: ms, slots: sl, demo: true });
        }
        case 'apply': {
          var name = cleanName(p.name), phone = cleanPhone(p.phone);
          if (!name) return fail('이름은 2~20자로 입력해 주세요.');
          if (!phone) return fail('연락처를 010-0000-0000 형식으로 입력해 주세요.');
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(p.email || '').trim())) return fail('이메일 주소를 확인해 주세요.');
          if (!/^\d{4}$/.test(p.pin || '')) return fail('확인번호는 숫자 4자리로 입력해 주세요.');
          if (p.agree !== true) return fail('개인정보 수집·이용에 동의해 주세요.');
          var slot = find(db.slots, p.slotId);
          if (!slot || slot.status !== '가능') return fail('방금 다른 분이 먼저 신청한 시간입니다. 다른 시간을 선택해 주세요.', 'SLOT_TAKEN');
          var m = find(db.managers, slot.managerId);
          var app = { id: 'A' + rid(6), appliedAt: now, slotId: slot.id, managerId: m.id, managerName: m.name, date: slot.date, start: slot.start, end: slot.end,
                      name: name, phone: phone, email: String(p.email).trim(), message: String(p.message || '').slice(0, 300), pin: p.pin, status: '확인중', memo: '', handledAt: '', handledBy: '' };
          db.apps.push(app); slot.status = '대기'; save(db);
          return ok({ id: app.id, managerName: m.name, date: slot.date, start: slot.start, end: slot.end });
        }
        case 'lookup': {
          var n2 = cleanName(p.name), p2 = cleanPhone(p.phone);
          var items = db.apps.filter(function (a) { return a.name === n2 && a.phone === p2 && a.pin === p.pin; })
            .map(function (a) { return { id: a.id, managerName: a.managerName, date: a.date, start: a.start, end: a.end, appliedAt: a.appliedAt,
                                         status: a.status === '확정' && (a.date + ' ' + a.start) < now ? '종료' : a.status }; });
          if (!items.length) return fail('일치하는 신청 내역이 없습니다. 입력한 정보를 다시 확인해 주세요.');
          return ok({ items: items });
        }
        case 'adminLogin': {
          if (p.password !== DEMO_PW) return fail('비밀번호가 올바르지 않습니다. (데모 비밀번호: ' + DEMO_PW + ')');
          var t = rid(10) + rid(10); db.tokens[t] = { who: p.who || '운영자' }; save(db);
          return ok({ token: t, who: p.who || '운영자' });
        }
        case 'adminLogout': delete db.tokens[p.token]; save(db); return ok({});
        case 'adminData':
          if (!auth(db, p)) return fail('로그인이 만료되었습니다. 다시 로그인해 주세요.', 'AUTH');
          return ok({
            managers: db.managers.map(function (m) { return Object.assign({ email: '' }, m); }).sort(function (a, b) { return a.order - b.order; }),
            slots: db.slots.slice().sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); }),
            apps: db.apps.map(function (a) { var c = Object.assign({}, a); delete c.pin; c.past = (a.date + ' ' + a.start) < now; return c; })
              .sort(function (a, b) { return b.appliedAt.localeCompare(a.appliedAt); }),
            slotMinutes: SLOT_MIN
          });
        case 'adminUpdateApp': {
          var who = auth(db, p); if (!who) return fail('로그인이 만료되었습니다.', 'AUTH');
          var a2 = find(db.apps, p.appId); if (!a2) return fail('신청 내역을 찾을 수 없습니다.');
          if (typeof p.memo === 'string') a2.memo = p.memo.slice(0, 500);
          if (p.status && p.status !== a2.status) {
            var s2 = find(db.slots, a2.slotId);
            if (a2.status === '취소' && s2 && s2.status !== '가능' && s2.status !== '닫힘') return fail('이 시간에는 이미 다른 신청이 들어와 있어 되돌릴 수 없습니다.');
            if (s2) s2.status = { '확인중': '대기', '확정': '확정', '종료': '확정', '취소': (s2.date + ' ' + s2.start) > now ? '가능' : '닫힘' }[p.status];
            a2.status = p.status; a2.handledAt = now; a2.handledBy = who.who;
          }
          save(db); return ok({});
        }
        case 'adminAddSlots': {
          if (!auth(db, p)) return fail('로그인이 만료되었습니다.', 'AUTH');
          if (!p.managerId || !p.date || !p.start || !p.end) return fail('매니저, 날짜, 시간을 모두 선택해 주세요.');
          if (p.date < today) return fail('지난 날짜에는 시간을 추가할 수 없습니다.');
          var s = toMin(p.start), e = toMin(p.end); if (e - s < SLOT_MIN) return fail('종료 시간은 시작 시간보다 30분 이상 뒤여야 합니다.');
          var have = {}; db.slots.forEach(function (x) { if (x.managerId === p.managerId && x.date === p.date) have[x.start] = 1; });
          var added = 0, skipped = 0;
          for (var t2 = s; t2 + SLOT_MIN <= e && added < 24; t2 += SLOT_MIN) {
            if (have[fromMin(t2)]) { skipped++; continue; }
            db.slots.push({ id: 'S' + rid(8), managerId: p.managerId, date: p.date, start: fromMin(t2), end: fromMin(t2 + SLOT_MIN), status: '가능' }); added++;
          }
          save(db); return ok({ added: added, skipped: skipped });
        }
        case 'adminSetSlot': {
          if (!auth(db, p)) return fail('로그인이 만료되었습니다.', 'AUTH');
          var s3 = find(db.slots, p.slotId); if (!s3) return fail('시간을 찾을 수 없습니다.');
          if (s3.status !== '가능' && s3.status !== '닫힘') return fail('신청이 들어온 시간입니다. 신청 내역에서 먼저 처리해 주세요.');
          s3.status = p.status; save(db); return ok({});
        }
        case 'adminSaveManager': {
          if (!auth(db, p)) return fail('로그인이 만료되었습니다.', 'AUTH');
          var mm = p.manager || {}; if (!String(mm.name || '').trim()) return fail('이름을 입력해 주세요.');
          if (mm.photo && !/^https:\/\//i.test(mm.photo)) return fail('사진 주소는 https:// 로 시작해야 합니다.');
          var vals = { email: mm.email || '', name: mm.name.trim(), oneLine: mm.oneLine || '', detail: mm.detail || '', topics: mm.topics || [], photo: mm.photo || '', visible: !!mm.visible, order: Number(mm.order) || 999 };
          if (mm.id) { Object.assign(find(db.managers, mm.id), vals); r = mm.id; }
          else { r = 'M' + pad(db.managers.length + 1); vals.id = r; db.managers.push(vals); }
          save(db); return ok({ id: r });
        }
        default: return fail('잘못된 요청입니다.');
      }
    }

    return { handle: handle, reset: function () { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } } };
  })();

  window.API = { call: call, isDemo: DEMO, resetDemo: Demo.reset };
})();
