import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "../lib/platform";

// 구글 드라이브 권한 (앱 전용 숨김 폴더만: drive.appdata — 구글 심사가 필요 없는 권장 범위)
// - APK: 안드로이드 Google Identity AuthorizationClient (네이티브 플러그인 GoogleDrivePlugin.java).
//   Google Cloud에 패키지 이름 + 서명 SHA-1로 만든 "Android" OAuth 클라이언트만 있으면 된다.
// - 웹(PWA): Google Identity Services 토큰 방식. VITE_GOOGLE_CLIENT_ID(웹 OAuth 클라이언트 ID)가 필요하다.

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

interface GoogleDrivePlugin {
  authorize(options: { interactive: boolean }): Promise<{ accessToken: string }>;
}

const NativeDrive = registerPlugin<GoogleDrivePlugin>("GoogleDrive");
const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

/** 다시 로그인(동의)해야 하는 경우 */
export class AuthRequiredError extends Error {}

let cached: { token: string; expires: number } | null = null;

export function driveAvailability(): { ok: true } | { ok: false; reason: string } {
  if (isNativeApp || WEB_CLIENT_ID) return { ok: true };
  return { ok: false, reason: "웹 버전은 구글 클라이언트 ID(VITE_GOOGLE_CLIENT_ID) 설정이 필요합니다. APK에서는 바로 쓸 수 있습니다." };
}

/** 액세스 토큰 (약 1시간 유효). interactive=false면 화면을 띄우지 않고 조용히 시도한다 */
export async function getAccessToken(interactive: boolean): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const token = isNativeApp ? await nativeToken(interactive) : await webToken(interactive);
  cached = { token, expires: Date.now() + 55 * 60_000 };
  return token;
}

export function invalidateToken() {
  cached = null;
}

/** 이 앱에 준 드라이브 권한을 거둔다 */
export async function revokeAccess(): Promise<void> {
  const token = cached?.token;
  cached = null;
  if (!token) return;
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch {
    // 오프라인이어도 이 기기에서는 연결을 끊는다
  }
}

async function nativeToken(interactive: boolean): Promise<string> {
  try {
    return (await NativeDrive.authorize({ interactive })).accessToken;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === "NEED_CONSENT" || e.code === "CANCELED") throw new AuthRequiredError(e.message ?? "구글 계정 연결이 필요합니다");
    throw new Error(friendlyAuthError(e.message));
  }
}

function friendlyAuthError(message?: string): string {
  // DEVELOPER_ERROR(10): Google Cloud의 Android OAuth 클라이언트(패키지 이름·SHA-1)가 없거나 다름
  if (message && /\b10\b|DEVELOPER_ERROR/.test(message)) {
    return "Google Cloud 설정이 앱과 맞지 않습니다 (DEVELOPER_ERROR: Android OAuth 클라이언트의 패키지 이름·SHA-1 확인)";
  }
  return message || "구글 계정 연결에 실패했습니다";
}

// ── 웹: Google Identity Services ────────────────────────────

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (resp: TokenResponse) => void;
    error_callback?: (err: { type?: string; message?: string }) => void;
  }): { requestAccessToken(options?: { prompt?: string }): void };
}

declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleOAuth2 } };
  }
}

let gisLoading: Promise<void> | null = null;

function loadGis(): Promise<void> {
  gisLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisLoading = null;
      reject(new Error("구글 로그인 스크립트를 불러오지 못했습니다 (인터넷 연결 확인)"));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

async function webToken(interactive: boolean): Promise<string> {
  if (!WEB_CLIENT_ID) throw new Error("웹 버전은 구글 클라이언트 ID 설정이 필요합니다");
  // 웹 토큰 방식은 팝업 없이 갱신할 수 없어서, 만료되면 사용자가 다시 눌러 연결해야 한다
  if (!interactive) throw new AuthRequiredError("구글 계정을 다시 연결해 주세요");
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: WEB_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.access_token) resolve(resp.access_token);
        else reject(new AuthRequiredError(resp.error_description ?? resp.error ?? "구글 계정 연결이 취소되었습니다"));
      },
      error_callback: (err) => reject(new AuthRequiredError(err.message ?? "구글 계정 연결이 취소되었습니다")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}
