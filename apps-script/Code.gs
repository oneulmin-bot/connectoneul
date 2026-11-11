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
  '매니저': ['매니저ID', '이름', '한줄소개', '상세소개', '주제', '사진URL', '노출여부', '정렬순서', '이메일'],
  '가능시간': ['슬롯ID', '매니저ID', '날짜', '시작', '종료', '상태', '등록시각'],
  '신청': ['신청ID', '신청시각', '슬롯ID', '매니저ID', '매니저이름', '날짜', '시작', '종료',
          '이름', '연락처', '하고싶은이야기', '확인번호(암호화)', '동의시각', '상태', '매니저메모', '처리시각', '처리자', '캘린더ID', '이메일'],
  '처리기록': ['시각', '처리자', '구분', '대상ID', '내용'],
  '설정': ['항목', '값', '설명']
};

var DEFAULT_SETTINGS = [
  ['운영주체', '사단법인 오늘은', '개인정보 동의 문구 등에 표시되는 이름'],
  ['장소안내', '공덕역 마스터즈타워 7층 (대학내일 건물)', '신청 화면에 표시되는 장소 안내'],
  ['소개문구', '관심 있는 매니저를 골라 30분 커피챗을 신청해 보세요.', '첫 화면 상단 안내 문구'],
  ['완료안내', '신청이 접수되었습니다. 매니저가 확인한 뒤 남겨주신 연락처로 확정 연락을 드립니다.', '신청 완료 화면 문구'],
  ['개인정보보유기간', '커피챗 종료 후 6개월', '개인정보 동의 문구의 보유 기간'],
  ['신청받기', 'Y', 'N으로 바꾸면 전체 신청이 잠시 중단됩니다'],
  ['신청알림메일', 'Y', 'Y면 신청이 들어올 때 담당 매니저에게 메일을 보냅니다'],
  ['신청자안내메일', 'Y', 'Y면 신청자에게 접수·확정·취소 안내 메일을 보냅니다'],
  ['운영자메일', '', '매니저 이메일이 비어 있을 때(예: 기타) 대신 받을 주소. 여러 명은 쉼표로 구분'],
  ['홈페이지주소', 'https://oneulmin-bot.github.io/connectoneul/', '알림 메일 속 관리자 페이지 링크에 쓰입니다'],
  ['문의카카오', '', '카카오톡 채널 주소(예: https://pf.kakao.com/_xxxx). 홈페이지·안내 메일의 문의 버튼에 쓰입니다'],
  ['캘린더ID', '', '확정된 커피챗을 등록할 구글 캘린더 주소(예: xxx@gmail.com). 비우면 등록하지 않음']
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
    .addItem('3. 알림 메일 테스트 (나에게 보내기)', 'testMail')
    .addItem('4. 캘린더 연결 테스트', 'testCalendar')
    .addToUi();
}

/** 메일 보내기 권한을 승인하고, 내 메일로 예시 알림을 보냅니다. */
function testMail() {
  var me = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  sendMail_(me, {
    managerName: '테스트', date: nowStr_().slice(0, 10), start: '14:00', end: '14:30',
    name: '홍길동', phone: '010-0000-0000', message: '알림 메일 테스트입니다.', appId: 'TEST'
  });
  safeAlert_(me + ' 로 테스트 메일을 보냈습니다. 메일함(스팸함 포함)을 확인해 주세요.\n남은 하루 발송 가능 수: ' + MailApp.getRemainingDailyQuota());
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

  // 설정 탭: 없는 항목만 아래에 추가 (이미 바꾼 값은 그대로 둠)
  var have = getSettings_();
  DEFAULT_SETTINGS.forEach(function (row) {
    if (!have.hasOwnProperty(row[0])) appendObj_(SHEET.SETTING, { '항목': row[0], '값': row[1], '설명': row[2] });
  });

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
      kakao: safeUrl_(settings['문의카카오']),
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
  var email = cleanEmail_(b.email);
  var pin = String(b.pin || '').trim();
  var message = String(b.message || '').trim().slice(0, 300);
  var slotId = String(b.slotId || '').trim();

  if (!name) return fail_('이름은 2~20자로 입력해 주세요.');
  if (!phone) return fail_('연락처를 010-0000-0000 형식으로 입력해 주세요.');
  if (!email) return fail_('이메일 주소를 확인해 주세요. (예: name@example.com)');
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
      '매니저메모': '', '처리시각': '', '처리자': '', '이메일': email
    });
    setCell_(slotTable, row, '상태', SLOT_STATUS.HOLD);
    log_('신청자', '신청', appId, slot.date + ' ' + slot.start + ' / ' + str_(mRow['이름']));

    var mail = {
      to: str_(mRow['이메일']), managerName: str_(mRow['이름']), date: slot.date, start: slot.start, end: slot.end,
      name: name, phone: phone, message: message, appId: appId, email: email
    };
  } finally {
    lock.releaseLock();
  }

  // 잠금을 푼 뒤 메일 발송 (메일이 실패해도 신청은 이미 저장됨)
  notifyManager_(mail, settings);
  notifyApplicant_('접수', mail, settings);
  return ok_({ id: appId, managerName: mail.managerName, date: mail.date, start: mail.start, end: mail.end });
}

// ───────────────────────── 신청 알림 메일 ─────────────────────────
function notifyManager_(info, settings) {
  try {
    if (!isYes_(settings['신청알림메일'] || 'Y')) return;
    var to = validEmails_(info.to) || validEmails_(settings['운영자메일']);
    if (!to) { log_('시스템', '메일생략', info.appId, '받을 이메일이 없음 (매니저 이메일 또는 운영자메일 입력 필요)'); return; }
    sendMail_(to, info, settings['홈페이지주소']);
    log_('시스템', '메일발송', info.appId, info.managerName + ' 매니저에게 알림');
  } catch (e) {
    console.error(e);
    log_('시스템', '메일실패', info.appId, String(e && e.message || e).slice(0, 200));
  }
}

function sendMail_(to, info, siteUrl) {
  var e = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var admin = (/^https:\/\//.test(siteUrl || '') ? String(siteUrl).replace(/\/?$/, '/') : '') + 'admin.html';
  var when = info.date + ' ' + info.start + '–' + info.end;
  var row = function (k, v) {
    return '<tr><td style="padding:8px 12px;color:#555;white-space:nowrap;border-bottom:1px solid #eee">' + k +
           '</td><td style="padding:8px 12px;border-bottom:1px solid #eee">' + v + '</td></tr>';
  };
  var html =
    '<div style="font-family:Apple SD Gothic Neo,Malgun Gothic,sans-serif;max-width:520px;color:#000;line-height:1.6">' +
    '<p style="font-size:13px;color:#1f65b8;font-weight:700;margin:0 0 4px">사단법인 오늘은 커피챗</p>' +
    '<h2 style="font-size:20px;margin:0 0 12px">' + e(info.managerName) + ' 매니저님, 새 커피챗 신청이 들어왔어요</h2>' +
    '<table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:16px">' +
      row('일시', '<b>' + e(when) + '</b>') +
      row('신청자', e(info.name)) +
      row('연락처', '<a href="tel:' + e(String(info.phone).replace(/\D/g, '')) + '">' + e(info.phone) + '</a>') +
      row('나누고 싶은 이야기', e(info.message || '-').replace(/\n/g, '<br>')) +
      row('신청번호', e(info.appId)) +
    '</table>' +
    '<p style="font-size:14px;margin:0 0 16px">신청자에게 직접 연락하신 뒤, 관리자 페이지에서 <b>[확정하기]</b>를 눌러 주세요.<br>' +
    '어려운 경우 <b>[거절·취소]</b>를 누르면 그 시간이 다시 열립니다.</p>' +
    (admin !== 'admin.html' ? '<p><a href="' + e(admin) + '" style="display:inline-block;background:#1f65b8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:700">관리자 페이지 열기</a></p>' : '') +
    '<p style="font-size:12px;color:#777;margin-top:20px">이 메일에는 신청자 개인정보가 들어 있습니다. 커피챗 목적 외에는 쓰지 말고, 전달하지 말아 주세요.</p>' +
    '</div>';
  MailApp.sendEmail({
    to: to,
    subject: '[오늘은 커피챗] 새 신청 · ' + when + ' · ' + info.name,
    htmlBody: html,
    body: info.managerName + ' 매니저님, 새 커피챗 신청: ' + when + ' / ' + info.name + ' / ' + info.phone + (admin !== 'admin.html' ? '\n관리자: ' + admin : ''),
    name: '사단법인 오늘은 커피챗'
  });
}

// ───────────────────────── 신청자 안내 메일 ─────────────────────────
/** kind: '접수' | '확정' | '취소' */
function notifyApplicant_(kind, info, settings) {
  try {
    if (!isYes_(settings['신청자안내메일'] || 'Y')) return;
    var to = cleanEmail_(info.email);
    if (!to) return;
    sendApplicantMail_(kind, to, info, settings);
    log_('시스템', '신청자메일', info.appId, kind + ' 안내');
  } catch (e) {
    console.error(e);
    log_('시스템', '신청자메일실패', info.appId, kind + ': ' + String(e && e.message || e).slice(0, 180));
  }
}

function sendApplicantMail_(kind, to, info, settings) {
  var e = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var site = /^https:\/\//.test(settings['홈페이지주소'] || '') ? String(settings['홈페이지주소']).replace(/\/?$/, '/') : '';
  var org = settings['운영주체'] || '사단법인 오늘은';
  var kakao = safeUrl_(settings['문의카카오']);
  var when = info.date + ' ' + info.start + '–' + info.end;
  var T = {
    '접수': {
      subject: '[오늘은 커피챗] 신청이 접수되었어요 · ' + when,
      title: '커피챗 신청이 접수되었어요',
      lead: info.managerName + ' 매니저가 신청 내용을 확인하고 있어요. 확정되거나 일정 조정이 필요하면 이 메일로 다시 알려드릴게요.',
      button: '내 신청 확인하기'
    },
    '확정': {
      subject: '[오늘은 커피챗] 커피챗이 확정되었어요 · ' + when,
      title: '커피챗이 확정되었어요 ☕',
      lead: info.managerName + ' 매니저와의 커피챗이 확정되었어요. 상세 장소 등은 매니저가 남겨주신 연락처로 직접 안내드릴 예정이에요.',
      button: '내 신청 확인하기'
    },
    '취소': {
      subject: '[오늘은 커피챗] 신청하신 커피챗이 진행되기 어려워요 · ' + when,
      title: '이번 커피챗은 진행이 어려워요',
      lead: '신청해 주셔서 감사합니다. 아쉽게도 매니저 사정으로 이 시간에는 커피챗을 진행하기 어려워졌어요. 다른 시간이나 다른 매니저로 다시 신청해 주시면 반갑게 만날게요.',
      button: '다른 시간 보러 가기'
    }
  }[kind];
  var link = site ? site + (kind === '취소' ? 'times.html' : '#my') : '';
  var row = function (k, v) {
    return '<tr><td style="padding:8px 12px;color:#555;white-space:nowrap;border-bottom:1px solid #eee">' + k +
           '</td><td style="padding:8px 12px;border-bottom:1px solid #eee">' + v + '</td></tr>';
  };
  var html =
    '<div style="font-family:Apple SD Gothic Neo,Malgun Gothic,sans-serif;max-width:520px;color:#000;line-height:1.6">' +
    '<p style="font-size:13px;color:#1f65b8;font-weight:700;margin:0 0 4px">' + e(org) + ' 커피챗</p>' +
    '<h2 style="font-size:20px;margin:0 0 10px">' + e(info.name) + '님, ' + e(T.title) + '</h2>' +
    '<p style="font-size:14px;margin:0 0 14px">' + e(T.lead) + '</p>' +
    '<table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:16px">' +
      row('일시', '<b>' + e(when) + '</b>') +
      row('매니저', e(info.managerName) + ' 매니저') +
      (kind !== '취소' ? row('장소', e(settings['장소안내'] || '')) : '') +
      row('상태', '<b>' + ({ '접수': '매니저 확인중', '확정': '확정', '취소': '취소됨' }[kind]) + '</b>') +
      row('신청번호', e(info.appId)) +
    '</table>' +
    (link ? '<p><a href="' + e(link) + '" style="display:inline-block;background:#1f65b8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:700">' + e(T.button) + '</a></p>' : '') +
    '<div style="margin-top:20px;padding:12px 14px;background:#fef9d8;border-radius:12px;font-size:13px">' +
      '<b>문의는 카카오톡 채널 ‘' + e(org) + '’에 남겨 주세요.</b><br>' +
      (kakao ? '<a href="' + e(kakao) + '" style="color:#000;font-weight:700">카카오톡 채널 바로가기 →</a>'
             : '카카오톡에서 ‘' + e(org) + '’ 채널을 검색해 추가해 주세요.') +
      '<br><span style="color:#777">이 메일은 발신 전용이라 답장하셔도 확인이 어려워요.</span></div>' +
    '<p style="font-size:12px;color:#777;margin-top:14px">진행 상황이 바뀌면 이 메일 주소로 안내드려요. ‘내 신청 확인’에서는 이름·연락처·확인번호로 확인할 수 있어요. · ' + e(org) + '</p></div>';
  MailApp.sendEmail({
    to: to, subject: T.subject, htmlBody: html, name: org + ' 커피챗',
    body: info.name + '님, ' + T.title + '\n' + when + ' / ' + info.managerName + ' 매니저' + (link ? '\n' + link : '') +
          '\n\n문의: 카카오톡 채널 ‘' + org + '’' + (kakao ? ' ' + kakao : '') + ' (이 메일은 발신 전용입니다)'
  });
}

function cleanEmail_(v) {
  var s = String(v || '').trim().slice(0, 100);
  return /^[^@\s<>"',;]+@[^@\s<>"',;]+\.[^@\s<>"',;]+$/.test(s) ? s : '';
}

/** 쉼표로 구분된 주소 중 형식이 맞는 것만 남깁니다. 없으면 빈 문자열. */
function validEmails_(v) {
  return String(v || '').split(/[,;\s]+/).filter(function (x) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); }).join(',');
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
      p.email = str_(m['이메일']);   // 관리자 화면에서만 반환 (공개 조회에는 없음)
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
        name: str_(r['이름']), phone: str_(r['연락처']), email: str_(r['이메일']), message: str_(r['하고싶은이야기']),
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
      var calendar = syncCalendar_(appTable, app, status, who);
      // 신청자 메일: 확인중→확정, 확인중/확정→취소 일 때만 (되돌리기 등에는 보내지 않음)
      var mailKind = (status === '확정' && before === '확인중') ||
                     (status === '취소' && (before === '확인중' || before === '확정'));
      if (mailKind && str_(app['이메일'])) {
        var applicantMail = {
          email: str_(app['이메일']), name: str_(app['이름']), managerName: str_(app['매니저이름']),
          date: cellDate_(app['날짜']), start: cellTime_(app['시작']), end: cellTime_(app['종료']), appId: appId
        };
      }
    } else if (typeof b.memo === 'string') {
      log_(who, '메모', appId, '');
    }
    var result = ok_({ calendar: calendar || '', mailed: applicantMail ? true : false });
  } finally {
    lock.releaseLock();
  }
  // 잠금을 푼 뒤 신청자 안내 메일 (실패해도 상태 변경은 유지)
  if (applicantMail) notifyApplicant_(status, applicantMail, getSettings_());
  return result;
}

// ───────────────────────── 오늘은 캘린더 연동 ─────────────────────────
/**
 * 확정 → 캘린더에 일정 추가 / 취소·확인중으로 되돌림 → 일정 삭제 / 종료 → 그대로 둠
 * 반환: 'added' | 'removed' | 'failed' | 'off' | ''
 * 캘린더가 공개라서 일정은 비공개로 넣고, 연락처는 넣지 않습니다.
 */
function syncCalendar_(appTable, app, status, who) {
  var calId = str_(getSettings_()['캘린더ID']);
  if (!calId) return 'off';
  var appId = str_(app['신청ID']);
  if (appTable.headers.indexOf('캘린더ID') < 0) {
    log_('시스템', '캘린더생략', appId, "신청 탭에 '캘린더ID' 열이 없음 (시트 자동 세팅 다시 실행 필요)");
    return 'failed';
  }
  var eventId = str_(app['캘린더ID']);
  try {
    var cal = CalendarApp.getCalendarById(calId);
    if (!cal) throw new Error('캘린더를 찾을 수 없거나 권한이 없습니다: ' + calId);

    if (status === '확정') {
      if (eventId && cal.getEventById(eventId)) return '';   // 이미 등록됨 (종료 → 확정 되돌리기 등)
      var date = cellDate_(app['날짜']), start = cellTime_(app['시작']), end = cellTime_(app['종료']);
      var s = Utilities.parseDate(date + ' ' + start, TZ, 'yyyy-MM-dd HH:mm');
      var e = Utilities.parseDate(date + ' ' + end, TZ, 'yyyy-MM-dd HH:mm');
      var name = str_(app['이름']);
      var ev = cal.createEvent('☕ 커피챗 · ' + str_(app['매니저이름']) + ' 매니저', s, e, {
        location: str_(getSettings_()['장소안내']),
        description: '신청자: ' + name + '\n신청번호: ' + appId + '\n확정: ' + who +
                     '\n\n연락처 등 자세한 내용은 커피챗 관리자 페이지에서 확인하세요.'
      });
      try { ev.setVisibility(CalendarApp.Visibility.PRIVATE); } catch (x) { console.error(x); }
      setCell_(appTable, app, '캘린더ID', ev.getId());
      log_('시스템', '캘린더등록', appId, date + ' ' + start);
      return 'added';
    }
    if ((status === '취소' || status === '확인중') && eventId) {
      var old = cal.getEventById(eventId);
      if (old) old.deleteEvent();
      setCell_(appTable, app, '캘린더ID', '');
      log_('시스템', '캘린더삭제', appId, '');
      return 'removed';
    }
    return '';
  } catch (err) {
    console.error(err);
    log_('시스템', '캘린더실패', appId, String(err && err.message || err).slice(0, 200));
    return 'failed';
  }
}

/** 시트 메뉴: 캘린더 권한을 승인하고, 테스트 일정을 만들었다가 바로 지웁니다. */
function testCalendar() {
  var calId = str_(getSettings_()['캘린더ID']);
  if (!calId) { safeAlert_("설정 탭의 '캘린더ID' 값에 오늘은 캘린더 주소(예: xxx@gmail.com)를 먼저 넣어 주세요."); return; }
  var cal = CalendarApp.getCalendarById(calId);
  if (!cal) {
    safeAlert_('캘린더에 접근할 수 없습니다: ' + calId + '\n\n캘린더 주인 계정에서 이 스크립트 계정(' +
      Session.getEffectiveUser().getEmail() + ')에 [일정 변경] 권한으로 공유해 주세요.');
    return;
  }
  var now = new Date();
  var ev = cal.createEvent('커피챗 연결 테스트 (곧 삭제됨)', now, new Date(now.getTime() + 30 * 60000));
  ev.deleteEvent();
  safeAlert_('캘린더 연결 성공: ' + cal.getName() + '\n이제 매니저가 [확정하기]를 누르면 이 캘린더에 일정이 등록됩니다.');
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
  var email = String(m.email || '').trim();
  var badEmail = email.split(/[,;\s]+/).filter(String).some(function (x) { return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); });
  if (badEmail) return fail_('이메일 형식을 확인해 주세요. (여러 개는 쉼표로 구분)');

  var values = {
    '이름': name,
    '한줄소개': String(m.oneLine || '').trim().slice(0, 60),
    '상세소개': String(m.detail || '').trim().slice(0, 1000),
    '주제': splitTopics_(m.topics).join(','),
    '사진URL': photo.slice(0, 500),
    '노출여부': m.visible ? 'Y' : 'N',
    '정렬순서': String(Number(m.order) || 999),
    '이메일': validEmails_(email).slice(0, 200)
  };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return fail_('잠시 후 다시 시도해 주세요.');
  try {
    var table = readTable_(SHEET.MANAGER);
    if (table.headers.indexOf('이메일') < 0) {
      return fail_('시트에 \'이메일\' 열이 없습니다. 시트 메뉴 [☕ 커피챗 관리] > [1. 시트 자동 세팅]을 한 번 더 실행해 주세요.');
    }
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
