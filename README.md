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

## 베트남 독립·분단·통일 인터랙티브 지도

`public/vietnam-history-map.html`은 프랑스령 인도차이나 연방부터 베트남 사회주의 공화국 성립까지 13개 장면을 움직이는 지도로 보여 주는 단독 실행 HTML입니다. 지도 데이터가 파일 안에 들어 있어 인터넷 없이도 열립니다(글꼴만 온라인일 때 Google Fonts를 씁니다).

- 바로 열기: 파일을 더블클릭해 브라우저에서 엽니다.
- 개발 서버: `npm run dev` 후 `http://localhost:3000/vietnam`
- 조작: `→`/`Space` 다음, `←` 이전, `P` 자동 재생, `F` 전체 화면, `T` 밝은/어두운 화면, `R` 원래 시점. 지도는 끌어서 옮기고 휠·두 손가락으로 확대합니다. 지역에 마우스를 올리면 당시 국가 이름이 뜹니다.
- 특정 장면 링크: `#indochina`, `#japan`, `#independence`, `#war1`, `#dienbienphu`, `#geneva`, `#election`, `#tonkin`, `#tet`, `#nixon`, `#paris`, `#saigon`, `#unification`

지도 윤곽은 Natural Earth 1:10m 국가 경계(퍼블릭 도메인)를 줄여 넣은 것입니다. 다시 만들 때는 `scripts/build-vietnam-map-geo.mjs` 머리말의 순서를 따릅니다.

## 일본 55년 체제 의석도

`public/japan-1955-system.html`은 중의원 의석 반원 도표(점 1개 = 의원 1명)로 55년 체제의 성립(1955)과 붕괴(1993), 그 이후(2009·2012·개헌 추진)를 12개 장면으로 보여 주는 단독 실행 HTML입니다. 마지막 장면은 1955–2012년 총선 20회의 정당별 의석 비율 그래프입니다.

- 바로 열기: 파일을 더블클릭합니다. 개발 서버에서는 `http://localhost:3000/japan55`
- 조작: `→`/`Space` 다음, `←` 이전, `P` 자동 재생, `F` 전체 화면, `T` 밝은/어두운 화면. 점이나 그래프에 마우스를 올리면 정당 이름과 의석수가 뜹니다.
- 특정 장면 링크: `#treaty`, `#e1955`, `#jsp`, `#ldp`, `#anpo`, `#growth`, `#lockheed`, `#collapse`, `#dpj`, `#ldp2012`, `#kaiken`, `#summary`
- 의석 자료: 각 회 중의원 총선거 결과. 1955년 자민당 의석은 2월 총선의 민주당+자유당 합계, 사회당은 좌파+우파 합계입니다.
