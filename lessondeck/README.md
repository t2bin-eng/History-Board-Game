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

## 배포 (Vercel)

Vercel 프로젝트의 **Root Directory를 `lessondeck`**으로 지정합니다. 나머지 설정은 `vercel.json`에 있습니다.

## 폴더 구조

```
src/
  ink/        필기 엔진 (획 데이터, perfect-freehand 렌더링, 지우개 판정, 실행 취소)
  pdf/        pdf.js 설정과 페이지 캔버스
  ui/         펜 팔레트, 도구 설정 팝오버, 디버그 패널
  lib/        디버그 통계 저장소
scripts/
  copy-pdfjs-assets.mjs   빌드 전 pdf.js cmaps·글꼴·wasm을 public/pdfjs로 복사
  make-static-assets.mjs  샘플 PDF·아이콘 생성 (Playwright 필요, 결과물은 커밋됨)
```
