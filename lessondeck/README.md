# 레슨덱 (LessonDeck)

PDF 페이지 사이에 HTML 웹앱을 독립 페이지로 끼워 넣고, 모든 페이지 위에 S펜으로 판서하는 태블릿용 수업 리더입니다.
요구사항과 개발 단계는 [SPEC.md](./SPEC.md)를 따릅니다.

> 이 폴더는 `History-Board-Game` 저장소 안의 독립 프로젝트입니다. 루트의 보드게임(Next.js)과 의존성·빌드를 공유하지 않습니다.

## 현재 단계: Phase 0 (필기감 검증)

- 샘플 PDF(`public/sample.pdf`, 필기감 시험지) 1쪽을 pdfjs-dist로 렌더링
- 그 위에 S펜 필기 캔버스: perfect-freehand + 필압, `getCoalescedEvents()`·`getPredictedEvents()`
- 진행 중인 획은 별도 캔버스(저지연 `desynchronized` 옵션)에만 그리고, 펜을 떼면 아래 캔버스에 합성
- 펜·형광펜·지우개(획 단위), 색 5개·굵기 3단계, 실행 취소/다시 실행, 페이지 필기 지우기
- S펜 = 필기, 손가락 = 무시(손바닥 오인식 방지). 상단 ✋ 버튼으로 "손가락으로도 필기" 전환
- S펜 사이드 버튼을 누른 채 쓰면 임시 지우개
- 오른쪽 아래 디버그 패널: `pointerType`, `pressure`, `buttons`, 기울기, 이벤트 빈도, 입력 지연, Phase 0 체크리스트, 검증 결과 복사
- PWA: 홈 화면 설치(전체 화면), pdf.js 워커·한글 cmaps·샘플 PDF까지 사전 캐시해 오프라인 동작
- 상단 📂 버튼으로 기기의 PDF를 열어 1쪽에 시험 필기 가능

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
  pdf/        pdf.js 설정과 페이지 캔버스
  ui/         펜 팔레트, 도구 설정 팝오버, 디버그 패널
  lib/        디버그 통계, 실행 환경(APK/브라우저) 판별, 안드로이드 뒤로 가기 처리
android/      Capacitor 안드로이드 프로젝트 (전체 화면·화면 켜짐 유지: MainActivity.java)
scripts/
  copy-pdfjs-assets.mjs   빌드 전 pdf.js cmaps·글꼴·wasm을 public/pdfjs로 복사
  make-static-assets.mjs  샘플 PDF·PWA 아이콘·안드로이드 아이콘 생성 (Playwright 필요, 결과물은 커밋됨)
```
