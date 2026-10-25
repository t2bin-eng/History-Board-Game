import { Cloud, CloudCheck, CloudOff, LogOut, RefreshCw, TriangleAlert, X } from "lucide-react";
import { useEffect } from "react";
import { connectDrive, disconnectDrive, syncNow, useSyncState, type SyncState } from "../sync/syncEngine";
import { relativeTime } from "./HomeScreen";

/** 저장소에 고정한 디버그 서명 키의 SHA-1 (Google Cloud의 Android OAuth 클라이언트에 등록) */
const SIGNING_SHA1 = "26:9D:BE:BA:3A:BF:3F:AE:61:A8:CF:97:FC:35:5E:EC:1F:52:1E:35";
const PACKAGE_NAME = "kr.lessondeck.app";

/** 상단 바의 동기화 상태 버튼 */
export function SyncButton({ onClick }: { onClick: () => void }) {
  const s = useSyncState();
  const label = statusLabel(s);
  return (
    <button type="button" className={`icon-btn sync-btn ${s.phase}`} aria-label={`구글 드라이브: ${label}`} title={label} onClick={onClick}>
      <SyncIcon state={s} size={22} />
      {(s.phase === "error" || s.phase === "needs-auth") && <span className="sync-alert" aria-hidden="true" />}
    </button>
  );
}

function SyncIcon({ state, size }: { state: SyncState; size: number }) {
  switch (state.phase) {
    case "syncing":
      return <RefreshCw size={size} className="spin" />;
    case "idle":
      return <CloudCheck size={size} />;
    case "off":
    case "unavailable":
    case "offline":
      return <CloudOff size={size} />;
    default:
      return <Cloud size={size} />;
  }
}

function statusLabel(s: SyncState): string {
  switch (s.phase) {
    case "off":
      return "연결 안 됨";
    case "unavailable":
      return "이 버전에서는 사용할 수 없음";
    case "idle":
      return s.lastSyncAt ? `동기화됨 · ${relativeTime(s.lastSyncAt)}` : "연결됨";
    case "syncing":
      return s.message ?? "동기화 중…";
    case "offline":
      return "오프라인 (인터넷에 연결되면 동기화)";
    case "needs-auth":
      return "다시 연결 필요";
    case "error":
      return `오류: ${s.message ?? ""}`;
  }
}

// 구글 드라이브 백업·동기화 설정 창
export function SyncPanel({ onClose }: { onClose: () => void }) {
  const s = useSyncState();
  const connected = s.phase !== "off" && s.phase !== "unavailable";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal sync-panel" role="dialog" aria-label="구글 드라이브 백업·동기화" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <strong>구글 드라이브 백업·동기화</strong>
          <button className="pp-icon" aria-label="닫기" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className={`sync-status ${s.phase}`}>
          <SyncIcon state={s} size={26} />
          <div>
            <strong>{connected ? (s.email ?? "연결됨") : statusLabel(s)}</strong>
            <small>{connected ? statusLabel(s) : (s.message ?? "연결하면 이 기기의 문서가 드라이브에 백업됩니다")}</small>
          </div>
        </div>

        <div className="sync-actions">
          {!connected && s.phase !== "unavailable" && (
            <button className="primary" onClick={() => connectDrive()}>
              <Cloud size={18} /> 구글 계정 연결
            </button>
          )}
          {s.phase === "needs-auth" && (
            <button className="primary" onClick={() => connectDrive()}>
              <Cloud size={18} /> 다시 연결
            </button>
          )}
          {connected && s.phase !== "needs-auth" && (
            <button className="primary" disabled={s.phase === "syncing"} onClick={() => syncNow()}>
              <RefreshCw size={18} className={s.phase === "syncing" ? "spin" : undefined} /> 지금 동기화
            </button>
          )}
          {connected && (
            <button
              onClick={() => {
                if (window.confirm("이 기기에서 구글 드라이브 연결을 끊을까요?\n기기 안 문서와 드라이브 백업은 그대로 남습니다.")) disconnectDrive();
              }}
            >
              <LogOut size={18} /> 연결 끊기
            </button>
          )}
        </div>

        {s.phase === "error" && s.message && (
          <p className="sync-error">
            <TriangleAlert size={16} /> {s.message}
          </p>
        )}

        <ul className="sync-notes">
          <li>문서·필기·원본 파일(PDF·이미지·동영상 등)이 드라이브의 <b>레슨덱 전용 공간</b>에 저장됩니다. 드라이브 목록에는 보이지 않고, 레슨덱만 읽고 쓸 수 있습니다.</li>
          <li>다른 기기에서 레슨덱을 설치하고 <b>같은 구글 계정</b>을 연결하면 문서를 모두 받아 오고, 이후 고칠 때마다 자동으로 맞춥니다.</li>
          <li>두 기기에서 같은 문서를 동시에 고치면 한쪽을 "(다른 기기)" 사본으로 남겨 아무것도 잃지 않습니다.</li>
          <li>동영상처럼 큰 파일은 처음 올리거나 받을 때 시간이 걸립니다. 와이파이에서 연결하기를 권합니다.</li>
        </ul>

        <details className="sync-setup">
          <summary>처음 한 번: Google Cloud 설정 방법 (관리자용)</summary>
          <ol>
            <li>
              <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">
                console.cloud.google.com
              </a>
              에서 새 프로젝트를 만듭니다.
            </li>
            <li>
              <b>API 및 서비스 → 라이브러리</b>에서 <b>Google Drive API</b>를 사용 설정합니다.
            </li>
            <li>
              <b>OAuth 동의 화면</b>(Google 인증 플랫폼): 앱 이름 "레슨덱", 사용자 유형 <b>외부</b>. 범위에 <code>.../auth/drive.appdata</code>를 추가하고, 테스트 사용자에 쓸 구글 계정을 넣습니다.
            </li>
            <li>
              <b>사용자 인증 정보 → OAuth 클라이언트 ID 만들기 → Android</b>
              <br />
              패키지 이름: <code>{PACKAGE_NAME}</code>
              <br />
              SHA-1: <code className="wrap">{SIGNING_SHA1}</code>
            </li>
            <li>앱 업데이트 없이 바로 "구글 계정 연결"을 누르면 됩니다.</li>
          </ol>
        </details>
      </section>
    </div>
  );
}
