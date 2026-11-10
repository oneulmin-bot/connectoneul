# 사단법인 오늘은 커피챗 · 매니저 커피챗 신청

참여자가 매니저 소개를 보고, 매니저가 열어 둔 30분 시간 중 하나를 골라 커피챗을 신청하는 홈페이지입니다.
최종 확정은 매니저가 직접 연락합니다.

- 디자인: 「오늘은 BRAND DESIGN」 디자인 시스템 (로고, 색, SUITE·SUIT 글꼴)
- 화면: 순수 HTML/CSS/JS (빌드 도구 없음) → GitHub Pages
- 데이터: 비공개 구글시트
- 연결: Google Apps Script 웹앱 (`apps-script/Code.gs`)

👉 설정 방법은 **[SETUP.md](SETUP.md)** 를 따라 하세요.

## 페이지
| 파일 | 내용 |
|---|---|
| `index.html` | 매니저 카드 목록 + 내 신청 확인 (이름·연락처·확인번호 4자리) |
| `manager.html?id=M01` | 매니저 상세, 날짜·시간 선택, 신청서, 완료 화면 |
| `admin.html` | 관리자(공통 비밀번호): 신청 내역 처리 · 시간 관리 · 매니저 소개 수정 |

## 파일 구조
```
index.html / manager.html / admin.html
assets/css/style.css     오늘은 디자인 가이드 기반 스타일
assets/img/              오늘은 로고·심볼
assets/js/config.js      ★ 웹앱 URL 설정 (비우면 데모 모드)
assets/js/api.js         서버 통신 + 데모 서버
assets/js/common.js      공통 도구
assets/js/home.js / manager.js / admin.js
apps-script/Code.gs      Apps Script에 붙여넣을 코드
SETUP.md                 비개발자용 설정 안내
```

## 보안 원칙
- 공개 조회는 매니저 공개 정보와 시간별 가능/마감 여부만 반환합니다.
- 신청자 정보는 관리자 로그인 또는 본인 확인(이름+연락처+확인번호) 후에만 반환합니다.
- 신청은 `LockService`로 잠근 뒤 해당 시간이 아직 가능한지 다시 확인하고 저장합니다.
- 비밀번호와 확인번호는 해시로만 저장하고, 로그인·조회 실패가 반복되면 잠시 잠급니다.
- 이 저장소는 공개입니다. 개인정보, 비밀번호, 실제 연락처를 커밋하지 마세요.
