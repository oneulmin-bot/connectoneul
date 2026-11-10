/**
 * connectoneul — 매니저 커피챗 신청 백엔드 (Google Apps Script)
 *
 * 사용법 요약 (자세한 내용은 SETUP.md)
 *  1) 구글시트 > 확장 프로그램 > Apps Script 에 이 파일 전체를 붙여넣고 저장
 *  2) 시트를 새로고침 → 상단 메뉴 [☕ 커피챗 관리] > [1. 시트 자동 세팅]
 *  3) [☕ 커피챗 관리] > [2. 관리자 비밀번호 설정]
 *  4) 배포 > 새 배포 > 웹 앱 (실행: 나 / 액세스: 모든 사용자)
 *
 * 보안 원칙
 *  - 공개 조회(doGet)는 매니저 공개 정보 + 시간별 가능/마감 여부만 반환합니다.
 *  - 신청자 이름·연락처는 관리자 로그인(토큰) 또는 본인 확인(이름+연락처+확인번호) 후에만 반환합니다.
 *  - 비밀번호·확인번호는 원문이 아닌 암호화(해시) 값만 저장합니다.
 */

// ───────────────────────── 기본 설정 ─────────────────────────
var TZ = 'Asia/Seoul';
var SLOT_MINUTES = 30;          // 한 타임 길이(분)
var TOKEN_HOURS = 6;            // 관리자 로그인 유지 시간
var MAX_SLOTS_PER_ADD = 24;     // 한 번에 추가할 수 있는 최대 타임 수

var SHEET = {
  MANAGER: '매니저',
  SLOT: '가능시간',
  APP: '신청',
  LOG: '처리기록',
  SETTING: '설정'
};

var HEADERS = {
  '매니저': ['매니저ID', '이름', '한줄소개', '상세소개', '주제', '사진URL', '노출여부', '정렬순서'],
  '가능시간': ['슬롯ID', '매니저ID', '날짜', '시작', '종료', '상태', '등록시각'],
  '신청': ['신청ID', '신청시각', '슬롯ID', '매니저ID', '매니저이름', '날짜', '시작', '종료',
          '이름', '연락처', '하고싶은이야기', '확인번호(암호화)', '동의시각', '상태', '매니저메모', '처리시각', '처리자'],
  '처리기록': ['시각', '처리자', '구분', '대상ID', '내용'],
  '설정': ['항목', '값', '설명']
};

var DEFAULT_SETTINGS = [
  ['운영주체', '사단법인 오늘은', '개인정보 동의 문구 등에 표시되는 이름'],
  ['장소안내', '공덕역 인근 (상세 장소는 매니저가 확정 연락 시 안내)', '신청 화면에 표시되는 장소 안내'],
  ['소개문구', '관심 있는 매니저를 골라 30분 커피챗을 신청해 보세요.', '첫 화면 상단 안내 문구'],
  ['완료안내', '신청이 접수되었습니다. 매니저가 확인한 뒤 남겨주신 연락처로 확정 연락을 드립니다.', '신청 완료 화면 문구'],
  ['개인정보보유기간', '커피챗 종료 후 6개월', '개인정보 동의 문구의 보유 기간'],
  ['신청받기', 'Y', 'N으로 바꾸면 전체 신청이 잠시 중단됩니다']
];

// 신청 상태 / 슬롯 상태
var APP_STATUS = ['확인중', '확정', '종료', '취소'];
var SLOT_STATUS = { OPEN: '가능', HOLD: '대기', BOOKED: '확정', CLOSED: '닫힘' };

// ───────────────────────── 시트 메뉴 ─────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('☕ 커피챗 관리')
    .addItem('1. 시트 자동 세팅', 'setupSheets')
    .addItem('2. 관리자 비밀번호 설정', 'setAdminPassword')
    .addToUi();
}

/** 탭과 열 이름을 자동으로 만듭니다. 이미 있는 데이터는 지우지 않습니다. */
function setupSheets() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(HEADERS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = HEADERS[name];
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#1F65B8').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    // 날짜·시간·연락처가 숫자/날짜로 바뀌지 않도록 저장할 때 텍스트로 고정합니다 (asText_ 참고)
  });

  var setting = ss.getSheetByName(SHEET.SETTING);
  if (setting.getLastRow() < 2) {
    setting.getRange(2, 1, DEFAULT_SETTINGS.length, 3).setValues(DEFAULT_SETTINGS);
  }

  var manager = ss.getSheetByName(SHEET.MANAGER);
  if (manager.getLastRow() < 2) {
    for (var i = 1; i <= 5; i++) {
      appendObj_(SHEET.MANAGER, {
        '매니저ID': 'M0' + i, '이름': '매니저 ' + i, '한줄소개': '한 줄 소개를 입력해 주세요',
        '주제': '진로,커리어', '노출여부': 'N', '정렬순서': String(i)
      });
    }
  }

  // 기본 '시트1' 이 비어 있으면 정리
  var blank = ss.getSheetByName('시트1') || ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

  safeAlert_('시트 세팅이 끝났습니다.\n\n다음 단계: [☕ 커피챗 관리] > [2. 관리자 비밀번호 설정]');
}

/** 관리자(매니저 공통) 비밀번호를 설정합니다. 원문은 저장하지 않습니다. */
function setAdminPassword() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('관리자 비밀번호 설정', '매니저들이 함께 쓸 비밀번호를 입력하세요 (8자 이상 권장).', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var pw = res.getResponseText().trim();
  if (pw.length < 6) { ui.alert('6자 이상으로 입력해 주세요.'); return; }
  var props = PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_PW_HASH', sha256_(salt_() + '|admin|' + pw));
  ui.alert('비밀번호가 설정되었습니다. 매니저들에게 안전한 방법으로 공유해 주세요.');
}

// ───────────────────────── 웹앱 진입점 ─────────────────────────
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'public';
    if (action === 'public') return json_(ok_(getPublicData_()));
    return json_(fail_('잘못된 요청입니다.'));
  } catch (err) {
    console.error(err);
    return json_(fail_('일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'));
  }
}

function doPost(e) {
  try {
    var body = {};
    try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
    catch (x) { return json_(fail_('잘못된 요청 형식입니다.')); }

    switch (body.action) {
      case 'apply':           return json_(apply_(body));
      case 'lookup':          return json_(lookup_(body));
      case 'adminLogin':      return json_(adminLogin_(body));
      case 'adminLogout':     return json_(adminLogout_(body));
      case 'adminData':       return json_(withAdmin_(body, adminData_));
      case 'adminUpdateApp':  return json_(withAdmin_(body, adminUpdateApp_));
      case 'adminAddSlots':   return json_(withAdmin_(body, adminAddSlots_));
      case 'adminSetSlot':    return json_(withAdmin_(body, adminSetSlot_));
      case 'adminSaveManager':return json_(withAdmin_(body, adminSaveManager_));
      default:                return json_(fail_('잘못된 요청입니다.'));
    }
  } catch (err) {
    console.error(err);
    return json_(fail_('일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'));
  }
}

// ───────────────────────── 공개 조회 ─────────────────────────
function getPublicData_() {
  var settings = getSettings_();
  var managers = readTable_(SHEET.MANAGER).rows
    .filter(function (m) { return isYes_(m['노출여부']) && m['매니저ID']; })
    .map(publicManager_)
    .sort(byOrder_);
  var visible = {};
  managers.forEach(function (m) { visible[m.id] = true; });

  var today = nowStr_().slice(0, 10);
  var now = nowStr_();
  var slots = readTable_(SHEET.SLOT).rows
    .map(normalizeSlot_)
    .filter(function (s) { return visible[s.managerId] && s.date >= today && s.status !== SLOT_STATUS.CLOSED; })
    .map(function (s) {
      // 공개 응답에는 '가능 여부'만 담습니다 (대기/확정 구분도 숨김)
      return { id: s.id, managerId: s.managerId, date: s.date, start: s.start, end: s.end,
               available: s.status === SLOT_STATUS.OPEN && (s.date + ' ' + s.start) > now };
    })
    .sort(bySlotTime_);

  return {
    settings: {
      orgName: settings['운영주체'] || '',
      place: settings['장소안내'] || '',
      intro: settings['소개문구'] || '',
      doneMessage: settings['완료안내'] || '',
      retention: settings['개인정보보유기간'] || '',
      open: isYes_(settings['신청받기'] || 'Y'),
      slotMinutes: SLOT_MINUTES
    },
    managers: managers,
    slots: slots
  };
}

function publicManager_(m) {
  return {
    id: str_(m['매니저ID']),
    name: str_(m['이름']),
    oneLine: str_(m['한줄소개']),
    detail: str_(m['상세소개']),
    topics: splitTopics_(m['주제']),
    photo: safeUrl_(m['사진URL']),
    order: Number(m['정렬순서']) || 999
  };
}

// ───────────────────────── 신청 ─────────────────────────
function apply_(b) {
  var name = cleanName_(b.name);
  var phone = cleanPhone_(b.phone);
  var pin = String(b.pin || '').trim();
  var message = String(b.message || '').trim().slice(0, 300);
  var slotId = String(b.slotId || '').trim();

  if (!name) return fail_('이름은 2~20자로 입력해 주세요.');
  if (!phone) return fail_('연락처를 010-0000-0000 형식으로 입력해 주세요.');
  if (!/^\d{4}$/.test(pin)) return fail_('확인번호는 숫자 4자리로 입력해 주세요.');
  if (b.agree !== true) return fail_('개인정보 수집·이용에 동의해 주세요.');
  if (!slotId) return fail_('시간을 선택해 주세요.');

  var settings = getSettings_();
  if (!isYes_(settings['신청받기'] || 'Y')) return fail_('지금은 신청을 받지 않고 있습니다.');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return fail_('신청이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.');
  try {
    // 잠금을 잡은 뒤 슬롯 상태를 다시 읽어 최종 확인
    var slotTable = readTable_(SHEET.SLOT);
    var row = find_(slotTable.rows, '슬롯ID', slotId);
    if (!row) return fail_('선택한 시간을 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.', 'SLOT_GONE');
    var slot = normalizeSlot_(row);
    if (slot.status !== SLOT_STATUS.OPEN || (slot.date + ' ' + slot.start) <= nowStr_()) {
      return fail_('방금 다른 분이 먼저 신청한 시간입니다. 다른 시간을 선택해 주세요.', 'SLOT_TAKEN');
    }
    var mRow = find_(readTable_(SHEET.MANAGER).rows, '매니저ID', slot.managerId);
    if (!mRow || !isYes_(mRow['노출여부'])) return fail_('현재 신청할 수 없는 매니저입니다.');

    var appId = 'A' + Utilities.formatDate(new Date(), TZ, 'yyMMdd') + '-' + randomId_(5);
    var now = nowStr_(true);
    appendObj_(SHEET.APP, {
      '신청ID': appId, '신청시각': now, '슬롯ID': slot.id, '매니저ID': slot.managerId,
      '매니저이름': str_(mRow['이름']), '날짜': slot.date, '시작': slot.start, '종료': slot.end,
      '이름': name, '연락처': phone, '하고싶은이야기': message,
      '확인번호(암호화)': pinHash_(phone, pin), '동의시각': now, '상태': '확인중',
      '매니저메모': '', '처리시각': '', '처리자': ''
    });
    setCell_(slotTable, row, '상태', SLOT_STATUS.HOLD);
    log_('신청자', '신청', appId, slot.date + ' ' + slot.start + ' / ' + str_(mRow['이름']));

    return ok_({ id: appId, managerName: str_(mRow['이름']), date: slot.date, start: slot.start, end: slot.end });
  } finally {
    lock.releaseLock();
  }
}

// ───────────────────────── 내 신청 확인 ─────────────────────────
function lookup_(b) {
  var name = cleanName_(b.name);
  var phone = cleanPhone_(b.phone);
  var pin = String(b.pin || '').trim();
  if (!name || !phone || !/^\d{4}$/.test(pin)) return fail_('이름, 연락처, 확인번호 4자리를 정확히 입력해 주세요.');

  var key = 'lookup_' + phone.replace(/\D/g, '');
  if (tooMany_(key, 5)) return fail_('조회 시도가 너무 많습니다. 10분 후 다시 시도해 주세요.');

  var hash = pinHash_(phone, pin);
  var now = nowStr_();
  var items = readTable_(SHEET.APP).rows
    .filter(function (r) {
      return str_(r['연락처']) === phone && str_(r['이름']) === name && str_(r['확인번호(암호화)']) === hash;
    })
    .map(function (r) {
      var date = cellDate_(r['날짜']), start = cellTime_(r['시작']);
      return {
        id: str_(r['신청ID']), managerName: str_(r['매니저이름']),
        date: date, start: start, end: cellTime_(r['종료']),
        status: displayStatus_(str_(r['상태']), date, start, now),
        appliedAt: str_(r['신청시각'])
      };
    })
    .sort(function (a, b2) { return (b2.date + b2.start).localeCompare(a.date + a.start); });

  if (!items.length) { countFail_(key); return fail_('일치하는 신청 내역이 없습니다. 입력한 정보를 다시 확인해 주세요.'); }
  return ok_({ items: items });
}

/** 확정된 커피챗의 시간이 지나면 참여자 화면에는 '종료'로 보여줍니다. */
function displayStatus_(status, date, start, now) {
  if (status === '확정' && (date + ' ' + start) < now) return '종료';
  return status || '확인중';
}

// ───────────────────────── 관리자 ─────────────────────────
function adminLogin_(b) {
  var who = String(b.who || '').trim().slice(0, 20) || '운영자';
  var pw = String(b.password || '');
  var stored = PropertiesService.getScriptProperties().getProperty('ADMIN_PW_HASH');
  if (!stored) return fail_('관리자 비밀번호가 아직 설정되지 않았습니다. 시트 메뉴에서 먼저 설정해 주세요.');
  if (tooMany_('admin_login', 10)) return fail_('로그인 시도가 너무 많습니다. 10분 후 다시 시도해 주세요.');

  if (sha256_(salt_() + '|admin|' + pw) !== stored) {
    countFail_('admin_login');
    return fail_('비밀번호가 올바르지 않습니다.');
  }
  var token = Utilities.getUuid() + randomId_(8);
  CacheService.getScriptCache().put('tok_' + token, JSON.stringify({ who: who }), TOKEN_HOURS * 3600);
  log_(who, '로그인', '', '');
  return ok_({ token: token, who: who });
}

function adminLogout_(b) {
  if (b.token) CacheService.getScriptCache().remove('tok_' + String(b.token));
  return ok_({});
}

function withAdmin_(b, fn) {
  var raw = b.token ? CacheService.getScriptCache().get('tok_' + String(b.token)) : null;
  if (!raw) return fail_('로그인이 만료되었습니다. 다시 로그인해 주세요.', 'AUTH');
  var session = JSON.parse(raw);
  return fn(b, session.who);
}

function adminData_() {
  var managers = readTable_(SHEET.MANAGER).rows
    .filter(function (m) { return m['매니저ID']; })
    .map(function (m) {
      var p = publicManager_(m);
      p.photo = str_(m['사진URL']);
      p.visible = isYes_(m['노출여부']);
      return p;
    })
    .sort(byOrder_);

  var slots = readTable_(SHEET.SLOT).rows.map(normalizeSlot_).filter(function (s) { return s.id; }).sort(bySlotTime_);

  var now = nowStr_();
  var apps = readTable_(SHEET.APP).rows
    .filter(function (r) { return r['신청ID']; })
    .map(function (r) {
      var date = cellDate_(r['날짜']), start = cellTime_(r['시작']);
      return {
        id: str_(r['신청ID']), appliedAt: str_(r['신청시각']), slotId: str_(r['슬롯ID']),
        managerId: str_(r['매니저ID']), managerName: str_(r['매니저이름']),
        date: date, start: start, end: cellTime_(r['종료']),
        name: str_(r['이름']), phone: str_(r['연락처']), message: str_(r['하고싶은이야기']),
        status: str_(r['상태']) || '확인중', past: (date + ' ' + start) < now,
        memo: str_(r['매니저메모']), handledAt: str_(r['처리시각']), handledBy: str_(r['처리자'])
      };
    })
    .sort(function (a, b2) { return (b2.appliedAt).localeCompare(a.appliedAt); });

  return ok_({ managers: managers, slots: slots, apps: apps, slotMinutes: SLOT_MINUTES });
}

function adminUpdateApp_(b, who) {
  var appId = String(b.appId || '');
  var status = b.status ? String(b.status) : null;
  if (status && APP_STATUS.indexOf(status) < 0) return fail_('잘못된 상태 값입니다.');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return fail_('잠시 후 다시 시도해 주세요.');
  try {
    var appTable = readTable_(SHEET.APP);
    var app = find_(appTable.rows, '신청ID', appId);
    if (!app) return fail_('신청 내역을 찾을 수 없습니다.');
    var before = str_(app['상태']) || '확인중';

    if (typeof b.memo === 'string') setCell_(appTable, app, '매니저메모', b.memo.trim().slice(0, 500));

    if (status && status !== before) {
      var slotTable = readTable_(SHEET.SLOT);
      var slotRow = find_(slotTable.rows, '슬롯ID', str_(app['슬롯ID']));

      if (before === '취소' && slotRow) {
        // 취소했던 신청을 되살릴 때: 그 사이 다른 사람이 신청했으면 불가
        var cur = normalizeSlot_(slotRow);
        if (cur.status !== SLOT_STATUS.OPEN && cur.status !== SLOT_STATUS.CLOSED) {
          return fail_('이 시간에는 이미 다른 신청이 들어와 있어 되돌릴 수 없습니다.');
        }
      }
      if (slotRow) {
        var s = normalizeSlot_(slotRow);
        var next = {
          '확인중': SLOT_STATUS.HOLD,
          '확정': SLOT_STATUS.BOOKED,
          '종료': SLOT_STATUS.BOOKED,
          '취소': (s.date + ' ' + s.start) > nowStr_() ? SLOT_STATUS.OPEN : SLOT_STATUS.CLOSED
        }[status];
        setCell_(slotTable, slotRow, '상태', next);
      }
      setCell_(appTable, app, '상태', status);
      setCell_(appTable, app, '처리시각', nowStr_(true));
      setCell_(appTable, app, '처리자', who);
      log_(who, '상태변경', appId, before + ' → ' + status);
    } else if (typeof b.memo === 'string') {
      log_(who, '메모', appId, '');
    }
    return ok_({});
  } finally {
    lock.releaseLock();
  }
}

function adminAddSlots_(b, who) {
  var managerId = String(b.managerId || '');
  var date = cellDate_(b.date);
  var start = cellTime_(b.start), end = cellTime_(b.end);
  if (!find_(readTable_(SHEET.MANAGER).rows, '매니저ID', managerId)) return fail_('매니저를 선택해 주세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail_('날짜를 확인해 주세요.');
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return fail_('시간을 확인해 주세요.');
  var s = toMin_(start), e = toMin_(end);
  if (e - s < SLOT_MINUTES) return fail_('종료 시간은 시작 시간보다 ' + SLOT_MINUTES + '분 이상 뒤여야 합니다.');
  if (date < nowStr_().slice(0, 10)) return fail_('지난 날짜에는 시간을 추가할 수 없습니다.');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return fail_('잠시 후 다시 시도해 주세요.');
  try {
    var existing = {};
    readTable_(SHEET.SLOT).rows.map(normalizeSlot_).forEach(function (x) {
      if (x.managerId === managerId && x.date === date) existing[x.start] = true;
    });
    var added = 0, skipped = 0;
    for (var t = s; t + SLOT_MINUTES <= e; t += SLOT_MINUTES) {
      if (added >= MAX_SLOTS_PER_ADD) break;
      var st = fromMin_(t);
      if (existing[st]) { skipped++; continue; }
      appendObj_(SHEET.SLOT, {
        '슬롯ID': 'S' + randomId_(8), '매니저ID': managerId, '날짜': date,
        '시작': st, '종료': fromMin_(t + SLOT_MINUTES), '상태': SLOT_STATUS.OPEN, '등록시각': nowStr_(true)
      });
      added++;
    }
    log_(who, '시간추가', managerId, date + ' ' + start + '~' + end + ' (' + added + '개)');
    return ok_({ added: added, skipped: skipped });
  } finally {
    lock.releaseLock();
  }
}

function adminSetSlot_(b, who) {
  var status = String(b.status || '');
  if (status !== SLOT_STATUS.OPEN && status !== SLOT_STATUS.CLOSED) return fail_('잘못된 상태 값입니다.');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return fail_('잠시 후 다시 시도해 주세요.');
  try {
    var table = readTable_(SHEET.SLOT);
    var row = find_(table.rows, '슬롯ID', String(b.slotId || ''));
    if (!row) return fail_('시간을 찾을 수 없습니다.');
    var cur = normalizeSlot_(row).status;
    if (cur !== SLOT_STATUS.OPEN && cur !== SLOT_STATUS.CLOSED) {
      return fail_('신청이 들어온 시간입니다. 신청 내역에서 먼저 처리해 주세요.');
    }
    setCell_(table, row, '상태', status);
    log_(who, '시간' + (status === SLOT_STATUS.OPEN ? '열기' : '닫기'), str_(row['슬롯ID']), '');
    return ok_({});
  } finally {
    lock.releaseLock();
  }
}

function adminSaveManager_(b, who) {
  var m = b.manager || {};
  var name = String(m.name || '').trim().slice(0, 30);
  if (!name) return fail_('이름을 입력해 주세요.');
  var photo = String(m.photo || '').trim();
  if (photo && !/^https:\/\//i.test(photo)) return fail_('사진 주소는 https:// 로 시작해야 합니다.');

  var values = {
    '이름': name,
    '한줄소개': String(m.oneLine || '').trim().slice(0, 60),
    '상세소개': String(m.detail || '').trim().slice(0, 1000),
    '주제': splitTopics_(m.topics).join(','),
    '사진URL': photo.slice(0, 500),
    '노출여부': m.visible ? 'Y' : 'N',
    '정렬순서': String(Number(m.order) || 999)
  };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return fail_('잠시 후 다시 시도해 주세요.');
  try {
    var table = readTable_(SHEET.MANAGER);
    var id = String(m.id || '');
    if (id) {
      var row = find_(table.rows, '매니저ID', id);
      if (!row) return fail_('매니저를 찾을 수 없습니다.');
      Object.keys(values).forEach(function (k) { setCell_(table, row, k, values[k]); });
      log_(who, '소개수정', id, name);
    } else {
      var max = 0;
      table.rows.forEach(function (r) { var n = parseInt(str_(r['매니저ID']).replace(/\D/g, ''), 10); if (n > max) max = n; });
      id = 'M' + (max + 1 < 10 ? '0' : '') + (max + 1);
      values['매니저ID'] = id;
      appendObj_(SHEET.MANAGER, values);
      log_(who, '매니저추가', id, name);
    }
    return ok_({ id: id });
  } finally {
    lock.releaseLock();
  }
}

// ───────────────────────── 시트 유틸 ─────────────────────────
function sheet_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('시트 탭이 없습니다: ' + name + ' (시트 자동 세팅을 먼저 실행하세요)');
  return sh;
}

function readTable_(name) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  var headers = (values.shift() || []).map(String);
  var rows = values.map(function (v, i) {
    var o = { _row: i + 2 };
    headers.forEach(function (h, j) { o[h] = v[j]; });
    return o;
  });
  return { sheet: sh, headers: headers, rows: rows };
}

function appendObj_(name, obj) {
  var sh = sheet_(name);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var row = headers.map(function (h) { return obj.hasOwnProperty(h) ? asText_(obj[h]) : ''; });
  sh.appendRow(row);
}

function setCell_(table, row, header, value) {
  var col = table.headers.indexOf(header);
  if (col < 0) throw new Error('열이 없습니다: ' + header);
  table.sheet.getRange(row._row, col + 1).setValue(asText_(value));
  row[header] = value;
}

function find_(rows, key, value) {
  for (var i = 0; i < rows.length; i++) if (str_(rows[i][key]) === value) return rows[i];
  return null;
}

/** 시트에 넣을 값을 텍스트로 고정하고, 수식(=, +, -, @)으로 해석되지 않게 막습니다. */
function asText_(v) {
  var s = String(v == null ? '' : v);
  if (s === '') return '';
  return "'" + s;
}

function log_(who, type, target, detail) {
  try { appendObj_(SHEET.LOG, { '시각': nowStr_(true), '처리자': who, '구분': type, '대상ID': target, '내용': detail }); }
  catch (e) { console.error(e); }
}

function getSettings_() {
  var out = {};
  try {
    readTable_(SHEET.SETTING).rows.forEach(function (r) { if (r['항목']) out[str_(r['항목'])] = str_(r['값']); });
  } catch (e) { console.error(e); }
  return out;
}

// ───────────────────────── 값 정리·검증 ─────────────────────────
function str_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm');
  return String(v == null ? '' : v).trim();
}

function cellDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  var m = String(v || '').trim().match(/^(\d{4})[-./\s]+(\d{1,2})[-./\s]+(\d{1,2})/);
  if (!m) return '';
  return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
}

function cellTime_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'HH:mm');
  var m = String(v || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return ('0' + m[1]).slice(-2) + ':' + m[2];
}

function normalizeSlot_(r) {
  return {
    id: str_(r['슬롯ID']), managerId: str_(r['매니저ID']),
    date: cellDate_(r['날짜']), start: cellTime_(r['시작']), end: cellTime_(r['종료']),
    status: str_(r['상태']) || SLOT_STATUS.OPEN
  };
}

function cleanName_(v) {
  var s = String(v || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim();
  return s.length >= 2 && s.length <= 20 ? s : '';
}

/** 010-1234-5678 형태로 정리합니다. 형식이 맞지 않으면 빈 문자열. */
function cleanPhone_(v) {
  var d = String(v || '').replace(/\D/g, '');
  if (!/^01[016789]\d{7,8}$/.test(d)) return '';
  return d.length === 11 ? d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7)
                         : d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
}

function splitTopics_(v) {
  var arr = Array.isArray(v) ? v : String(v || '').split(/[,，#\n]/);
  return arr.map(function (t) { return String(t).trim().slice(0, 20); }).filter(String).slice(0, 8);
}

function safeUrl_(v) {
  var s = str_(v);
  return /^https:\/\//i.test(s) ? s : '';
}

function isYes_(v) { return /^(y|yes|o|true|1|노출|예)$/i.test(str_(v)); }

function byOrder_(a, b) { return (a.order - b.order) || a.name.localeCompare(b.name); }
function bySlotTime_(a, b) { return (a.date + a.start).localeCompare(b.date + b.start); }

function nowStr_(withSec) {
  return Utilities.formatDate(new Date(), TZ, withSec ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd HH:mm');
}
function toMin_(t) { var p = t.split(':'); return Number(p[0]) * 60 + Number(p[1]); }
function fromMin_(m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }

// ───────────────────────── 보안 유틸 ─────────────────────────
function sha256_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function salt_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('SALT');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('SALT', s); }
  return s;
}

function pinHash_(phone, pin) { return sha256_(salt_() + '|pin|' + phone.replace(/\D/g, '') + '|' + pin); }

function randomId_(n) { return Utilities.getUuid().replace(/-/g, '').slice(0, n).toUpperCase(); }

function tooMany_(key, limit) {
  return Number(CacheService.getScriptCache().get('fail_' + key) || 0) >= limit;
}
function countFail_(key) {
  var c = CacheService.getScriptCache();
  c.put('fail_' + key, String(Number(c.get('fail_' + key) || 0) + 1), 600);
}

// ───────────────────────── 응답 ─────────────────────────
function ok_(data) { return { ok: true, data: data }; }
function fail_(message, code) { return { ok: false, message: message, code: code || '' }; }
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function safeAlert_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}
