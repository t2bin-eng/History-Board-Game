import { getAccessToken, invalidateToken } from "./auth";

// 구글 드라이브 REST API v3 (앱 전용 숨김 폴더 appDataFolder만 쓴다)

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
/** 이보다 큰 파일은 이어 올리기(resumable) 방식으로 */
const MULTIPART_LIMIT = 5 * 1024 * 1024;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  appProperties?: Record<string, string>;
}

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** 인증 헤더를 붙여 요청하고, 토큰이 만료(401)되면 한 번 새로 받아 다시 시도한다 */
async function request(url: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const token = await getAccessToken(false);
  const res = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } });
  if (res.status === 401 && !retried) {
    invalidateToken();
    return request(url, init, true);
  }
  if (!res.ok) throw new DriveError(await errorMessage(res), res.status);
  return res;
}

async function errorMessage(res: Response): Promise<string> {
  let reason = "";
  try {
    const body = await res.json();
    reason = body?.error?.errors?.[0]?.reason ?? body?.error?.message ?? "";
  } catch {
    // 본문이 JSON이 아님
  }
  if (reason === "storageQuotaExceeded") return "구글 드라이브 저장 공간이 부족합니다";
  if (res.status === 403) return `구글 드라이브 접근이 거부되었습니다 (${reason || 403})`;
  return `구글 드라이브 오류 ${res.status}${reason ? ` (${reason})` : ""}`;
}

export async function listAppFiles(): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({
      spaces: "appDataFolder",
      pageSize: "1000",
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,appProperties)",
    });
    if (pageToken) q.set("pageToken", pageToken);
    const body = await (await request(`${API}/files?${q}`)).json();
    files.push(...(body.files ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return files;
}

export async function downloadFile(id: string, mimeType?: string): Promise<Blob> {
  const blob = await (await request(`${API}/files/${id}?alt=media`)).blob();
  return mimeType && blob.type !== mimeType ? new Blob([blob], { type: mimeType }) : blob;
}

export async function deleteFile(id: string): Promise<void> {
  try {
    await request(`${API}/files/${id}`, { method: "DELETE" });
  } catch (err) {
    // 이미 지워진 파일은 괜찮다
    if (!(err instanceof DriveError && err.status === 404)) throw err;
  }
}

export async function aboutEmail(): Promise<string | undefined> {
  const body = await (await request(`${API}/about?fields=user(emailAddress)`)).json();
  return body?.user?.emailAddress;
}

interface UploadMeta {
  name?: string;
  mimeType?: string;
  appProperties?: Record<string, string>;
}

/** 새 파일 만들기 (appDataFolder) */
export async function createFile(meta: UploadMeta, data: Blob): Promise<string> {
  const metadata = { ...meta, parents: ["appDataFolder"] };
  if (data.size > MULTIPART_LIMIT) {
    const id = await resumableUpload(`${UPLOAD}/files?uploadType=resumable&fields=id`, "POST", metadata, data);
    if (id) return id;
  }
  return multipartUpload(`${UPLOAD}/files?uploadType=multipart&fields=id`, "POST", metadata, data);
}

/** 기존 파일 내용·속성 바꾸기 */
export async function updateFile(id: string, meta: UploadMeta, data: Blob): Promise<string> {
  if (data.size > MULTIPART_LIMIT) {
    const out = await resumableUpload(`${UPLOAD}/files/${id}?uploadType=resumable&fields=id`, "PATCH", meta, data);
    if (out) return out;
  }
  return multipartUpload(`${UPLOAD}/files/${id}?uploadType=multipart&fields=id`, "PATCH", meta, data);
}

async function multipartUpload(url: string, method: string, metadata: object, data: Blob): Promise<string> {
  const boundary = `lessondeck${Math.random().toString(36).slice(2)}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${data.type || "application/octet-stream"}\r\n\r\n`,
    data,
    `\r\n--${boundary}--`,
  ]);
  const res = await request(url, { method, headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
  return (await res.json()).id;
}

/** 큰 파일: 업로드 세션을 연 뒤 한 번에 보낸다. 세션 주소를 못 받으면 null (multipart로 대신) */
async function resumableUpload(url: string, method: string, metadata: object, data: Blob): Promise<string | null> {
  const init = await request(url, {
    method,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": data.type || "application/octet-stream",
      "X-Upload-Content-Length": String(data.size),
    },
    body: JSON.stringify(metadata),
  });
  const location = init.headers.get("Location");
  if (!location) return null;
  const res = await request(location, { method: "PUT", headers: { "Content-Type": data.type || "application/octet-stream" }, body: data });
  return (await res.json()).id;
}
