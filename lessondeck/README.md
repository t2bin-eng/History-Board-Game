# 레슨덱 (LessonDeck)

PDF 페이지 사이에 HTML 웹앱을 독립 페이지로 끼워 넣고, 모든 페이지 위에 S펜으로 판서하는 태블릿용 수업 리더입니다.
요구사항과 개발 단계는 [SPEC.md](./SPEC.md)를 따릅니다.

> 이 폴더는 `History-Board-Game` 저장소 안의 독립 프로젝트입니다. 루트의 보드게임(Next.js)과 의존성·빌드를 공유하지 않습니다.

## 현재 기능 (v0.3.0)

Phase 0(필기감 검증)에 태블릿 피드백(손가락 확대, 사이드 버튼 지우개, 페이지 관리)과 HTML·URL 페이지(F2·F3·F6)를 더한 상태입니다.

**HTML·URL 페이지**

- 페이지 추가 메뉴의 **HTML 파일…**: 파일 내용을 문서 안에 넣어 서버·인터넷 없이 실행 (`iframe srcdoc` + sandbox, 레슨덱 데이터에 접근 불가)
- **웹 주소(URL)…**: 이미 배포된 웹앱(형성평가 멀티툴 등). 페이지에 "인터넷 필요" 표시, 오프라인이면 경고
- 넣을 때 외부 라이브러리(CDN)·같은 폴더 파일·localStorage 사용을 찾아 알려 줌 (SPEC R4·R6), EUC-KR 파일도 읽음
- 기본은 **조작 모드**(손가락·펜으로 웹앱 사용). 툴바의 **판서** 스위치나 펜·형광펜·지우개를 고르면 판서 모드(파란 테두리), 다시 **조작**으로 돌아가도 필기는 남음
- 웹앱은 16:9(1280×720)·4:3(1024×768)·A4(794×1123) 가상 화면으로 그려 페이지에 맞춰 축소·확대 → TV 미러링에서도 잘리지 않음. 비율은 페이지 바에서 바꿈
- 최근 연 웹 페이지 3개는 닫지 않고 숨겨 둬서, 넘겼다 돌아와도 퀴즈 진행 상태가 유지됨
- 웹앱 안의 스와이프와 겹치지 않도록 HTML·URL 페이지에서는 쓸어 넘기기 대신 아래쪽 ‹ › 버튼 사용
- **숨기기**: HTML로 대체한 PDF 쪽 등을 지우지 않고 숨김. 넘길 때 건너뛰고 페이지 바에서 흐리게 보임

**페이지**

- 왼쪽 페이지 바(상단 ▯ 버튼으로 열고 닫기): 썸네일(필기 포함), 썸네일 사이 `+`로 그 위치에 추가
- 추가: 빈 페이지 · 모눈 페이지 · PDF 파일의 전 쪽 (상단 📄+ 버튼은 현재 페이지 뒤에 추가)
- 선택한 페이지: 앞으로·뒤로 이동, 복제, 삭제(알림의 "되돌리기"로 복구). 마지막 한 장은 삭제할 수 없음
- 페이지 넘기기: 손가락으로 좌우로 쓸기, 아래쪽 ‹ › 버튼, PC는 ←/→ 키
- 상단 📂 버튼: PDF를 새 문서로 열기 (필기가 있으면 확인)
- 실행 취소는 페이지마다 따로 동작

**손가락**

- 두 손가락으로 확대(최대 5배)·이동, 확대 상태에서는 한 손가락으로 이동, 두 번 탭하면 원래 크기
- 확대를 마치면 그 배율로 PDF와 필기를 다시 그려 선명하게 보임
- 펜을 쓰는 중(또는 직후 0.8초)의 터치는 손바닥으로 보고 무시

**필기 (Phase 0)**

- 샘플 PDF(`public/sample.pdf`, 필기감 시험지)를 pdfjs-dist로 렌더링
- 그 위에 S펜 필기 캔버스: perfect-freehand + 필압, `getCoalescedEvents()`·`getPredictedEvents()`
- 진행 중인 획은 별도 캔버스(저지연 `desynchronized` 옵션)에만 그리고, 펜을 떼면 아래 캔버스에 합성
- 펜·형광펜·지우개(획 단위), 색 5개·굵기 3단계, 실행 취소/다시 실행, 페이지 필기 지우기
- S펜 = 필기, 손가락 = 넘기기·확대. 상단 ✋ 버튼으로 "손가락으로도 필기" 전환 (이때 두 손가락은 확대)
- S펜 사이드 버튼을 누르고 있는 동안 지우개 (툴바 지우개 버튼이 켜지고, 떼면 펜으로 돌아감)
- 오른쪽 아래 디버그 패널: `pointerType`, `pressure`, `buttons`, 기울기, 이벤트 빈도, 입력 지연, Phase 0 체크리스트, 검증 결과 복사
- PWA: 홈 화면 설치(전체 화면), pdf.js 워커·한글 cmaps·샘플 PDF까지 사전 캐시해 오프라인 동작
- 아직 필기를 저장하지 않음 (앱을 닫으면 사라짐, Phase 3에서 IndexedDB 자동 저장)

## 실행

```bash
cd lessondeck
npm install
npm run dev        # http://localhost:5173
```

태블릿 시험은 반드시 HTTPS 주소(Vercel 미리보기)로 하세요. `getCoalescedEvents()`와 서비스 워커는 보안 컨텍스트(HTTPS·localhost)에서만 동작해서, 같은 와이파이의 `http://192.168.x.x` 주소로 열면 필기감이 실제보다 나쁘게 나옵니다.

## 검증

```bash
npm run type-check
npm test
npm run build && npm run preview
```

## 안드로이드 앱 (APK)

웹앱을 [Capacitor](https://capacitorjs.com)로 감싼 안드로이드 앱입니다. 앱 파일이 APK 안에 모두 들어 있어서 인터넷 없이 동작하고, 배포 주소도 필요 없습니다.

- **화면**: 상태 표시줄·내비게이션 바를 숨긴 전체 화면으로 열립니다. 수업 중에는 화면이 꺼지지 않습니다.
- **뒤로 가기**: 2초 안에 두 번 눌러야 앱이 닫힙니다. 수업 중 실수로 닫히는 것을 막기 위해서입니다.
- **글꼴 크기**: 기기의 글꼴 크기 설정과 관계없이 화면 배치가 유지됩니다.

### APK 받기 (GitHub Actions)

`lessondeck/`이 바뀐 커밋을 푸시하면 GitHub Actions의 **LessonDeck APK** 워크플로가 APK를 빌드합니다.

1. 저장소의 **Actions** 탭에서 **LessonDeck APK**를 고르고, 맨 위(최신) 실행을 엽니다.
2. 아래쪽 **Artifacts**에서 `lessondeck-<번호>-<커밋>.apk`를 내려받습니다. zip 파일로 받아지니 압축을 풉니다.
3. 태블릿에서 APK를 누릅니다. 처음 한 번은 "출처를 알 수 없는 앱 설치"를 허용해야 합니다.

모든 빌드가 저장소에 들어 있는 같은 디버그 키(`android/app/lessondeck-debug.keystore`)로 서명됩니다. 그래서 새 APK를 지우지 않고 기존 앱 위에 덮어 설치할 수 있습니다. 이 키는 기기에 직접 설치하는 시험용입니다. Play 스토어에 올리려면 배포용 키를 따로 만들어 비밀로 보관해야 합니다.

### 직접 빌드 (Windows PC)

[Android Studio](https://developer.android.com/studio)를 설치한 뒤 PowerShell에서 실행합니다.

```powershell
cd lessondeck
npm run android:sync          # 웹 빌드 후 android/ 프로젝트에 복사
cd android
.\gradlew.bat assembleDebug   # → app\build\outputs\apk\debug\app-debug.apk
```

Android Studio에서 열려면 `npx cap open android`를 실행합니다. USB로 연결한 태블릿에 바로 설치하며 시험할 수 있습니다.

## 배포 (Vercel)

Vercel 프로젝트의 **Root Directory를 `lessondeck`**으로 지정합니다. 나머지 설정은 `vercel.json`에 있습니다.

## 폴더 구조

```
src/
  ink/        필기 엔진 (획 데이터, perfect-freehand 렌더링, 지우개 판정, 실행 취소)
  pdf/        pdf.js 설정, 페이지 렌더 캐시(앞뒤 쪽 미리 그리기), 썸네일
  ui/         펜 팔레트, 도구 설정, 페이지 바·썸네일·추가 메뉴, 디버그 패널
  doc/        문서 구조(원본 PDF + 페이지 목록), 페이지 추가·삭제·이동
  view/       페이지 영역, 손가락 확대·이동·넘김 제스처
  lib/        펜·손가락 입력 상태(사이드 버튼, 손바닥), 디버그 통계, 실행 환경 판별, 안드로이드 뒤로 가기
android/      Capacitor 안드로이드 프로젝트 (전체 화면·화면 켜짐 유지: MainActivity.java)
scripts/
  copy-pdfjs-assets.mjs   빌드 전 pdf.js cmaps·글꼴·wasm을 public/pdfjs로 복사
  make-static-assets.mjs  샘플 PDF·PWA 아이콘·안드로이드 아이콘 생성 (Playwright 필요, 결과물은 커밋됨)
```
