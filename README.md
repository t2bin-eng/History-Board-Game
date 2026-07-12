# 역사 원정대: 퀴즈 보드 레이스

교실 수업을 위한 로컬 MVP입니다. 주사위를 굴린 뒤 역사 퀴즈를 맞혀야 이동이 확정되며, 점령·보호막·보너스·함정·지름길을 지원합니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 검증

```bash
npm run lint
npm run type-check
npm run test
npm run build
```

## 현재 MVP 범위

- 3개 팀, 80칸 역사 통합 보드
- 주사위, 30초 객관식 퀴즈, 정답 이동 확정과 오답 복귀
- 점령, 보호막, 보너스·함정·지름길·시대 관문 표현
- 교실 화면용 반응형 레이아웃

Supabase 실시간 동기화, 교사 대시보드, 문제 CSV 업로드 및 외부 SVG 업로드는 다음 단계에서 연결합니다.
