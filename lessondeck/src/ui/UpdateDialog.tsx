import { App as CapApp } from "@capacitor/app";
import { CircleCheck, Download, Link2, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkForUpdate,
  downloadUpdate,
  INSTALL_URL,
  installUpdate,
  skipVersion,
  type Release,
} from "../lib/appUpdate";
import { isNativeApp, showToast } from "../lib/platform";

// 업데이트 창 (v0.34, SPEC 6장 "업데이트"): 버전 표시(v0.xx)·새 버전 알림에서 연다.
// 확인 → (새 버전) 설명 · 업데이트 → 받기(진행) → 안드로이드 설치 화면. 처음 한 번은 "이 출처의 앱 설치 허용".

type State =
  | { step: "checking" }
  | { step: "latest"; current: string; release: Release | null }
  | { step: "available"; current: string; release: Release }
  | { step: "downloading"; current: string; release: Release; received: number; total: number }
  | { step: "permission"; current: string; release: Release }
  | { step: "installing"; current: string; release: Release }
  | { step: "error"; message: string; current?: string; release?: Release };

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`;

export function UpdateDialog({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<State>({ step: "checking" });
  const stateRef = useRef(state);
  stateRef.current = state;

  const check = useCallback(async () => {
    setState({ step: "checking" });
    try {
      const r = await checkForUpdate();
      if (r.newer && r.latest) setState({ step: "available", current: r.current, release: r.latest });
      else setState({ step: "latest", current: r.current, release: r.latest });
    } catch (err) {
      setState({ step: "error", message: (err as Error)?.message || "업데이트를 확인하지 못했습니다. 인터넷 연결을 확인해 주세요" });
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const install = useCallback(async (current: string, release: Release) => {
    try {
      const status = await installUpdate();
      setState({ step: status === "permission" ? "permission" : "installing", current, release });
    } catch (err) {
      setState({ step: "error", message: (err as Error)?.message || "설치 화면을 열지 못했습니다", current, release });
    }
  }, []);

  const update = async (current: string, release: Release) => {
    setState({ step: "downloading", current, release, received: 0, total: release.size });
    try {
      await downloadUpdate(release, (received, total) =>
        setState((s) => (s.step === "downloading" ? { ...s, received, total: total || s.total } : s)),
      );
    } catch (err) {
      setState({ step: "error", message: (err as Error)?.message || "새 버전을 받지 못했습니다", current, release });
      return;
    }
    await install(current, release);
  };

  // 설치 허용 설정에서 돌아오면 이어서 설치 화면을 연다
  useEffect(() => {
    if (!isNativeApp) return;
    const sub = CapApp.addListener("resume", () => {
      const s = stateRef.current;
      if (s.step === "permission") void install(s.current, s.release);
    });
    return () => {
      void sub.then((h) => h.remove());
    };
  }, [install]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_URL);
      showToast("설치 링크를 복사했습니다. 다른 선생님께 보내 주세요");
    } catch {
      window.prompt("설치 링크", INSTALL_URL);
    }
  };

  const busy = state.step === "checking" || state.step === "downloading";

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <section className="modal update-dialog" role="dialog" aria-label="업데이트" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <strong>업데이트</strong>
          <button className="pp-icon" aria-label="닫기" onClick={onClose} disabled={state.step === "downloading"}>
            <X size={20} />
          </button>
        </header>

        {state.step === "checking" && (
          <p className="dialog-text update-line">
            <span className="spinner" aria-hidden="true" /> 새 버전을 확인하고 있습니다…
          </p>
        )}

        {state.step === "latest" && (
          <>
            <p className="dialog-text update-line">
              <CircleCheck size={20} className="update-ok" /> 최신 버전입니다 <span className="update-ver">v{state.current}</span>
            </p>
            {!isNativeApp && <p className="dialog-text"><small>웹 버전은 열 때마다 저절로 최신이 됩니다.</small></p>}
          </>
        )}

        {(state.step === "available" || state.step === "downloading" || state.step === "permission" || state.step === "installing") && (
          <>
            <p className="dialog-text">
              새 버전 <span className="update-ver new">v{state.release.version}</span>이 있습니다{" "}
              <small>
                (지금 v{state.current}
                {state.release.size ? ` · ${mb(state.release.size)}` : ""})
              </small>
            </p>
            {state.release.notes && <pre className="update-notes">{state.release.notes}</pre>}
          </>
        )}

        {state.step === "downloading" && (
          <div className="update-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.total ? Math.round((state.received / state.total) * 100) : 0}>
            <span style={{ width: `${state.total ? Math.min(100, (state.received / state.total) * 100) : 0}%` }} />
            <small>
              받는 중… {mb(state.received)}
              {state.total ? ` / ${mb(state.total)}` : ""}
            </small>
          </div>
        )}

        {state.step === "permission" && (
          <p className="dialog-text update-hint">
            처음 한 번만: 열린 설정 화면에서 <strong>"이 출처 허용"</strong>을 켜고 돌아오면 설치 화면이 열립니다.
          </p>
        )}

        {state.step === "installing" && (
          <p className="dialog-text update-hint">
            설치 화면에서 <strong>업데이트</strong>를 누르세요. 설치가 끝나면 레슨덱이 새 버전으로 다시 열립니다 (문서는 그대로).
          </p>
        )}

        {state.step === "error" && <p className="dialog-text update-error">{state.message}</p>}

        {!isNativeApp && state.step !== "checking" && (
          <p className="dialog-text">
            <small>
              안드로이드 앱은 설치 링크로 받습니다. 앱에서는 이 창에서 바로 업데이트할 수 있습니다.
            </small>
          </p>
        )}

        <div className="dialog-actions">
          <button className="btn ghost left" onClick={copyLink} title={INSTALL_URL}>
            <Link2 size={16} /> 설치 링크 복사
          </button>
          {state.step === "available" && isNativeApp && (
            <>
              <button
                className="btn"
                onClick={() => {
                  skipVersion(state.release.version);
                  onClose();
                }}
              >
                이 버전 건너뛰기
              </button>
              <button className="btn primary" onClick={() => void update(state.current, state.release)}>
                <Download size={16} /> 업데이트
              </button>
            </>
          )}
          {state.step === "available" && !isNativeApp && (
            <a className="btn primary" href={state.release.url}>
              <Download size={16} /> 앱 받기
            </a>
          )}
          {state.step === "permission" && (
            <button className="btn primary" onClick={() => void install(state.current, state.release)}>
              설치
            </button>
          )}
          {state.step === "installing" && (
            <button className="btn" onClick={() => void install(state.current, state.release)}>
              설치 화면 다시 열기
            </button>
          )}
          {state.step === "error" && (
            <button className="btn primary" onClick={() => (state.release && state.current ? void update(state.current, state.release) : void check())}>
              <RefreshCw size={16} /> 다시 시도
            </button>
          )}
          {state.step === "latest" && (
            <button className="btn" onClick={onClose}>
              닫기
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
