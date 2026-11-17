import { Hand, Send, X } from "lucide-react";
import { AI_APPS, type AiAppId } from "../lib/aiShare";
import { IconButton } from "./IconButton";

/** "AI" 글자 아이콘 (v0.31) */
export function AiIcon({ size = 22 }: { size?: number }) {
  return (
    <span className="ai-icon" style={{ fontSize: Math.round(size * 0.58), minWidth: size, height: Math.round(size * 0.86) }} aria-hidden="true">
      AI
    </span>
  );
}

interface Props {
  app: AiAppId;
  onApp: (id: AiAppId) => void;
  text: string;
  onText: (text: string) => void;
  sending: boolean;
  onSend: () => void;
  onClose: () => void;
  fingerDraw: boolean;
  onFingerDraw: () => void;
}

// AI 창 위 막대 (v0.31): 닫기 · 보낼 앱 · 할 말 · 보내기
export function AiBar(props: Props) {
  return (
    <header className="topbar ai-bar">
      <div className="topbar-left">
        <IconButton label="AI 창 닫기" onClick={props.onClose}>
          <X size={24} />
        </IconButton>
        <span className="ai-title">
          <AiIcon size={20} /> AI로 보내기
        </span>
      </div>
      <div className="ai-apps" role="radiogroup" aria-label="보낼 AI 앱">
        {AI_APPS.map((a) => (
          <button key={a.id} role="radio" aria-checked={props.app === a.id} className={`ai-app ${a.id}`} onClick={() => props.onApp(a.id)}>
            {a.label}
          </button>
        ))}
      </div>
      <input
        className="ai-text"
        type="text"
        aria-label="AI에게 할 말"
        placeholder="AI에게 할 말 (비워도 됨)"
        value={props.text}
        enterKeyHint="send"
        onChange={(e) => props.onText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            props.onSend();
          }
        }}
      />
      <div className="topbar-right">
        <IconButton label={props.fingerDraw ? "손가락 필기 끄기" : "손가락으로도 필기"} active={props.fingerDraw} onClick={props.onFingerDraw}>
          <Hand size={22} />
        </IconButton>
        <button className="ai-send" onClick={props.onSend} disabled={props.sending}>
          {props.sending ? <span className="spinner" aria-hidden="true" /> : <Send size={18} />}
          보내기
        </button>
      </div>
    </header>
  );
}
