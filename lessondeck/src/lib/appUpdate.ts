import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isNativeApp } from "./platform";

// 앱 안 업데이트 (v0.34, SPEC 5장 "앱 배포·업데이트" · 6장 "업데이트").
// GitHub 릴리스(공개 저장소)의 최신 버전을 읽어 지금 버전보다 새로우면 알리고, 안드로이드 앱은 받아서 설치 화면을 연다.
// 웹 버전은 서비스 워커가 스스로 최신이 된다.

const REPO = "t2bin-eng/History-Board-Game";
export const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;
/** 처음 설치 링크 — 늘 최신 릴리스의 lessondeck.apk */
export const INSTALL_URL = `https://github.com/${REPO}/releases/latest/download/lessondeck.apk`;
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`;
export const APK_NAME = "lessondeck.apk";

const CHECKED_KEY = "lessondeck.updateCheckedAt";
const SKIP_KEY = "lessondeck.updateSkip";
/** 앱을 켤 때 자동 확인은 이만큼에 한 번 */
export const AUTO_CHECK_MS = 6 * 60 * 60 * 1000;

export interface Release {
  /** "0.35.0" (앞의 v 뺌) */
  version: string;
  /** 릴리스 설명 (커밋 메시지) */
  notes: string;
  /** lessondeck.apk 받는 주소 */
  url: string;
  size: number;
  published: string;
  page: string;
}

/** 버전 비교: "0.10.0" > "0.9.3". 숫자가 아닌 꼬리(-beta 등)는 무시 */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .replace(/^v/i, "")
      .split(/[.+-]/)
      .slice(0, 3)
      .map((x) => parseInt(x, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** GitHub API releases/latest 응답 → 릴리스 (lessondeck.apk가 없으면 null) */
export function parseRelease(json: unknown): Release | null {
  if (!json || typeof json !== "object") return null;
  const r = json as {
    tag_name?: unknown;
    body?: unknown;
    html_url?: unknown;
    published_at?: unknown;
    assets?: { name?: unknown; browser_download_url?: unknown; size?: unknown }[];
  };
  if (typeof r.tag_name !== "string" || !/^v?\d+\.\d+/.test(r.tag_name)) return null;
  const apk = (r.assets ?? []).find((a) => a && a.name === APK_NAME && typeof a.browser_download_url === "string");
  if (!apk) return null;
  const url = String(apk.browser_download_url);
  if (!url.startsWith("https://")) return null;
  return {
    version: r.tag_name.replace(/^v/i, ""),
    notes: typeof r.body === "string" ? r.body.trim() : "",
    url,
    size: typeof apk.size === "number" ? apk.size : 0,
    published: typeof r.published_at === "string" ? r.published_at : "",
    page: typeof r.html_url === "string" ? r.html_url : RELEASES_PAGE,
  };
}

export async function fetchLatestRelease(): Promise<Release | null> {
  const res = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
  // 릴리스가 아직 하나도 없음
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(res.status === 403 ? "잠시 뒤 다시 확인해 주세요 (확인 횟수 제한)" : `업데이트를 확인하지 못했습니다 (${res.status})`);
  return parseRelease(await res.json());
}

// ── 안드로이드 앱 (AppUpdatePlugin.java) ──

interface AppUpdatePlugin {
  info(): Promise<{ versionName: string; versionCode: number; canInstall: boolean }>;
  download(options: { url: string }): Promise<{ versionName: string; versionCode: number; bytes: number }>;
  install(): Promise<{ status: "started" | "permission" }>;
  addListener(event: "progress", fn: (p: { received: number; total: number }) => void): Promise<PluginListenerHandle>;
}

const Native = registerPlugin<AppUpdatePlugin>("AppUpdate");

/** 지금 버전: 앱은 설치된 versionName, 웹은 빌드한 버전 */
export async function currentVersion(): Promise<string> {
  if (isNativeApp) {
    try {
      return (await Native.info()).versionName || __APP_VERSION__;
    } catch {
      // 0.33 이전 앱 코드가 섞이는 일은 없지만, 못 읽으면 빌드 버전
    }
  }
  return __APP_VERSION__;
}

export interface UpdateCheck {
  current: string;
  latest: Release | null;
  newer: boolean;
}

export async function checkForUpdate(): Promise<UpdateCheck> {
  const [current, latest] = await Promise.all([currentVersion(), fetchLatestRelease()]);
  markChecked();
  return { current, latest, newer: !!latest && compareVersions(latest.version, current) > 0 };
}

/** 받기 (진행: 받은·전체 바이트). 받은 파일이 이 앱의 더 새 버전이고 서명이 같을 때만 성공 */
export async function downloadUpdate(release: Release, onProgress: (received: number, total: number) => void) {
  const handle = await Native.addListener("progress", (p) => onProgress(p.received, p.total || release.size));
  try {
    return await Native.download({ url: release.url });
  } finally {
    handle.remove();
  }
}

/** 받아 둔 새 버전으로 설치 화면. "permission"이면 설치 허용 설정 화면을 열었다 */
export async function installUpdate(): Promise<"started" | "permission"> {
  return (await Native.install()).status;
}

// ── 자동 확인·건너뛰기 (기기에 기억, SPEC 5장) ──

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 기억하지 못해도 동작한다
  }
}

export function markChecked(now = Date.now()) {
  write(CHECKED_KEY, String(now));
}

/** 앱을 켤 때 자동으로 확인할 때인지 (안드로이드 앱만, AUTO_CHECK_MS에 한 번) */
export function autoCheckDue(now = Date.now()): boolean {
  const last = Number(read(CHECKED_KEY) || 0);
  return !(last > 0 && now - last < AUTO_CHECK_MS && now >= last);
}

export function skipVersion(version: string) {
  write(SKIP_KEY, version);
}

/** "이 버전 건너뛰기"로 고른 버전이거나 그보다 오래된 버전이면 자동 알림을 하지 않는다 */
export function isSkipped(version: string): boolean {
  const skipped = read(SKIP_KEY);
  return !!skipped && compareVersions(version, skipped) <= 0;
}

// ── 업데이트 창 열기 (버전 표시·알림에서) ──

const openListeners = new Set<() => void>();

export function openUpdateDialog() {
  for (const fn of openListeners) fn();
}

export function onOpenUpdateDialog(fn: () => void): () => void {
  openListeners.add(fn);
  return () => openListeners.delete(fn);
}
