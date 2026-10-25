import { Check, ClipboardCopy, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { debugStats } from "../lib/debugStore";
import { isNativeApp } from "../lib/platform";

interface Props {
  lowLatency: boolean;
  onLowLatency: (on: boolean) => void;
  pdfRenderMs: number | null;
  onClose: () => void;
}

type ManualKey = "palm" | "hangul";
const MANUAL_STORAGE = "lessondeck.phase0.manual";

function loadManual(): Record<ManualKey, boolean> {
  try {
    return { palm: false, hangul: false, ...JSON.parse(localStorage.getItem(MANUAL_STORAGE) ?? "{}") };
  } catch {
    return { palm: false, hangul: false };
  }
}

function displayMode(): string {
  for (const m of ["fullscreen", "standalone", "minimal-ui"]) {
    if (window.matchMedia(`(display-mode: ${m})`).matches) return m;
  }
  return "browser";
}

function describeButtons(b: number): string {
  const parts: string[] = [];
  if (b & 1) parts.push("접촉");
  if (b & 2) parts.push("사이드");
  if (b & 4) parts.push("가운데");
  if (b & 32) parts.push("지우개끝");
  return parts.length ? parts.join("+") : "없음";
}

// Phase 0 필기감 검증용 디버그 패널 (SPEC 8장 체크리스트)
export function DebugPanel({ lowLatency, onLowLatency, pdfRenderMs, onClose }: Props) {
  const [, setTick] = useState(0);
  const [manual, setManual] = useState(loadManual);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, []);

  const toggleManual = (key: ManualKey) => {
    const next = { ...manual, [key]: !manual[key] };
    setManual(next);
    try {
      localStorage.setItem(MANUAL_STORAGE, JSON.stringify(next));
    } catch {
      // 사생활 보호 모드 등에서 저장이 막혀도 체크 표시는 화면에 남긴다
    }
  };

  const s = debugStats;
  const last = s.last;
  const hasPressure = s.penPressureSamples > 0;
  const pressureOk = s.penPressureSamples > 20 && s.penPressureMax - s.penPressureMin > 0.2 && s.penPressureMax <= 1;
  const mode = isNativeApp ? "APK" : displayMode();
  const fullscreenOk = isNativeApp || mode === "fullscreen" || mode === "standalone";

  const checklist: { label: string; ok: boolean; hint: string; manual?: ManualKey }[] = [
    {
      label: "S펜 필압 값이 0~1로 들어오는가",
      ok: pressureOk,
      hint: hasPressure ? `${s.penPressureMin.toFixed(2)} ~ ${s.penPressureMax.toFixed(2)}` : "펜으로 약하게·세게 그어 보세요",
    },
    {
      label: "손바닥을 대고 써도 오인식 없는가",
      ok: manual.palm,
      hint: `펜 쓰는 중 무시한 터치 ${s.rejectedTouches}회`,
      manual: "palm",
    },
    {
      label: "빠르게 쓴 한글 필기가 끊기지 않는가",
      ok: manual.hangul,
      hint: `${s.moveEventsPerSec}회/초 · 점 ${s.pointsPerSec}개/초`,
      manual: "hangul",
    },
    {
      label: "S펜 사이드 버튼 신호가 들어오는가",
      ok: s.sideButtonSeen,
      hint: s.sideButtonSeen ? "buttons & 2 감지" : "버튼을 누른 채 화면에 대 보세요",
    },
    {
      label: isNativeApp ? "APK 앱이 전체 화면으로 열리는가" : "홈 화면 PWA가 전체 화면으로 열리는가",
      ok: fullscreenOk,
      hint: isNativeApp ? "APK(안드로이드 WebView)로 실행 중" : `display-mode: ${mode}`,
    },
  ];

  const copyReport = async () => {
    const date = new Date().toISOString().slice(0, 10);
    const lines = [
      `### ${date} Phase 0 태블릿 확인`,
      `- 실행 환경: ${isNativeApp ? "APK (안드로이드 WebView)" : `브라우저 (display-mode: ${mode})`}`,
      `- 기기: ${navigator.userAgent}`,
      `- 화면: ${window.screen.width}×${window.screen.height}, devicePixelRatio ${window.devicePixelRatio}`,
      `- 저지연 캔버스: ${lowLatency ? "켬" : "끔"} · 입력 지연 ${s.inputDelayMs.toFixed(1)}ms · 획 렌더 ${s.renderMs.toFixed(2)}ms · move ${s.moveEventsPerSec}회/초 · 점 ${s.pointsPerSec}개/초`,
      ...checklist.map((c) => `- [${c.ok ? "x" : " "}] ${c.label} (${c.hint})`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("아래 내용을 복사하세요", lines.join("\n"));
    }
  };

  const reset = () => {
    Object.assign(debugStats, {
      penPressureMin: Infinity,
      penPressureMax: -Infinity,
      penPressureSamples: 0,
      sideButtonSeen: false,
      eraserTipSeen: false,
      penHoverSeen: false,
      rejectedTouches: 0,
      strokesDrawn: 0,
      log: [],
    });
  };

  return (
    <aside className="debug-panel" aria-label="디버그 패널" data-no-gesture>
      <header className="debug-head">
        <strong>입력 디버그</strong>
        <div className="debug-head-actions">
          <button onClick={reset} aria-label="통계 초기화" title="통계 초기화">
            <RotateCcw size={15} />
          </button>
          <button onClick={copyReport} aria-label="검증 결과 복사" title="검증 결과 복사 (SPEC 검증 기록용)">
            {copied ? <Check size={15} /> : <ClipboardCopy size={15} />}
          </button>
          <button onClick={onClose} aria-label="디버그 패널 닫기">
            <X size={15} />
          </button>
        </div>
      </header>

      <dl className="debug-grid">
        <dt>pointerType</dt>
        <dd className="mono">{last?.pointerType ?? "-"}</dd>
        <dt>pressure</dt>
        <dd>
          <span className="mono">{last ? last.pressure.toFixed(3) : "-"}</span>
          <span className="pressure-bar">
            <span style={{ width: `${(last?.pressure ?? 0) * 100}%` }} />
          </span>
        </dd>
        <dt>buttons</dt>
        <dd className="mono">
          {last ? `${last.buttons} (${describeButtons(last.buttons)})` : "-"}
        </dd>
        <dt>tilt X/Y</dt>
        <dd className="mono">{last ? `${last.tiltX}° / ${last.tiltY}°` : "-"}</dd>
        <dt>접촉 크기</dt>
        <dd className="mono">{last ? `${last.width.toFixed(1)}×${last.height.toFixed(1)}` : "-"}</dd>
        <dt>이벤트</dt>
        <dd className="mono">
          {s.moveEventsPerSec}/s · 점 {s.pointsPerSec}/s
        </dd>
        <dt>coalesced</dt>
        <dd className="mono">
          {s.lastCoalesced} · 예측 {s.lastPredicted}
        </dd>
        <dt>입력 지연</dt>
        <dd className="mono">{s.inputDelayMs.toFixed(1)} ms</dd>
        <dt>획 렌더</dt>
        <dd className="mono">{s.renderMs.toFixed(2)} ms</dd>
        <dt>PDF 렌더</dt>
        <dd className="mono">{pdfRenderMs == null ? "-" : `${pdfRenderMs.toFixed(0)} ms`}</dd>
        <dt>그린 획</dt>
        <dd className="mono">{s.strokesDrawn}</dd>
        <dt>펜 호버</dt>
        <dd className="mono">{s.penHoverSeen ? "감지됨" : "-"}</dd>
      </dl>

      <label className="debug-switch">
        <input type="checkbox" checked={lowLatency} onChange={(e) => onLowLatency(e.target.checked)} />
        저지연 캔버스 (desynchronized)
      </label>

      <ul className="debug-checklist">
        {checklist.map((c) => (
          <li key={c.label} className={c.ok ? "ok" : ""}>
            {c.manual ? (
              <label>
                <input type="checkbox" checked={c.ok} onChange={() => toggleManual(c.manual!)} />
                <span>{c.label}</span>
              </label>
            ) : (
              <span className="auto">
                <span className="auto-mark" aria-hidden="true">
                  {c.ok ? "✓" : "·"}
                </span>
                <span>{c.label}</span>
              </span>
            )}
            <small>{c.hint}</small>
          </li>
        ))}
      </ul>

      <ol className="debug-log mono">
        {s.log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
    </aside>
  );
}
