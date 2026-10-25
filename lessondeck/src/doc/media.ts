// 이미지·동영상 파일을 페이지 원본으로 준비한다.
// 브라우저(안드로이드 WebView)가 바로 못 여는 HEIC·TIFF는 변환하고, 아주 큰 사진은 줄여서 메모리를 아낀다.

export const IMAGE_ACCEPT = "image/*,.heic,.heif,.hif,.tif,.tiff,.avif,.svg,.bmp,.ico,.webp";
export const VIDEO_ACCEPT = "video/*,.mp4,.m4v,.mov,.webm,.mkv,.3gp,.ogv";

/** 이보다 긴 변은 줄인다 (태블릿 메모리 보호) */
const MAX_IMAGE_SIDE = 4096;

export interface PreparedMedia {
  blob: Blob;
  name: string;
  mime: string;
  width: number;
  height: number;
  duration?: number;
  poster?: string;
}

function ext(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

export function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || ["heic", "heif", "hif"].includes(ext(file.name));
}

export function isTiff(file: File): boolean {
  return /image\/tiff/i.test(file.type) || ["tif", "tiff"].includes(ext(file.name));
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/") || ["mp4", "m4v", "mov", "webm", "mkv", "3gp", "ogv"].includes(ext(file.name));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이 기기에서 열 수 없는 이미지 형식입니다"));
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지를 변환하지 못했습니다"))), type, quality),
  );
}

async function tiffToPng(file: File): Promise<Blob> {
  const UTIF = (await import("utif")).default;
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf);
  if (!ifds.length) throw new Error("TIFF 이미지를 읽지 못했습니다");
  UTIF.decodeImage(buf, ifds[0], ifds);
  const { width, height } = ifds[0];
  const rgba = UTIF.toRGBA8(ifds[0]);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const pixels = new Uint8ClampedArray(width * height * 4);
  pixels.set(rgba.subarray(0, pixels.length));
  canvas.getContext("2d")!.putImageData(new ImageData(pixels, width, height), 0, 0);
  return canvasToBlob(canvas, "image/png");
}

async function heicToJpeg(file: File): Promise<Blob> {
  const { heicTo } = await import("heic-to");
  return heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
}

/** 이미지 파일 → 페이지 원본 (HEIC·TIFF 변환, 큰 사진 줄이기) */
export async function prepareImage(file: File): Promise<PreparedMedia> {
  let blob: Blob = file;
  if (isHeic(file)) blob = await heicToJpeg(file);
  else if (isTiff(file)) blob = await tiffToPng(file);

  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    let width = img.naturalWidth;
    let height = img.naturalHeight;
    const mime = blob.type || "image/png";
    const keepAsIs = mime === "image/svg+xml" || mime === "image/gif";
    if (!width || !height) {
      // 크기 정보가 없는 SVG
      width = 1200;
      height = 900;
    } else if (!keepAsIs && Math.max(width, height) > MAX_IMAGE_SIDE) {
      const scale = MAX_IMAGE_SIDE / Math.max(width, height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const outType = mime === "image/jpeg" ? "image/jpeg" : "image/png";
      blob = await canvasToBlob(canvas, outType, 0.9);
      width = canvas.width;
      height = canvas.height;
    }
    return { blob, name: baseName(file.name), mime: blob.type || mime, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 동영상 파일 → 페이지 원본 (크기·길이 읽기, 첫 장면 썸네일) */
export async function prepareVideo(file: File): Promise<PreparedMedia> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("동영상 정보를 읽지 못했습니다")), 15000);
      video.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(timer);
        reject(new Error("이 기기에서 재생할 수 없는 동영상 형식입니다"));
      };
      video.src = url;
    });
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const duration = Number.isFinite(video.duration) ? video.duration : undefined;
    let poster: string | undefined;
    try {
      poster = await capturePoster(video, duration);
    } catch {
      // 첫 장면을 못 뽑아도 동영상은 넣는다
    }
    return { blob: file, name: baseName(file.name), mime: file.type || "video/mp4", width, height, duration, poster };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function capturePoster(video: HTMLVideoElement, duration: number | undefined): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 5000);
    video.onseeked = () => {
      clearTimeout(timer);
      resolve();
    };
    video.currentTime = Math.min(1, (duration ?? 2) / 10);
  });
  const w = 320;
  const h = Math.round((w * video.videoHeight) / Math.max(1, video.videoWidth));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h || 180;
  canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.75);
}

/** 재생 시간 표시 (예: 3:05) */
export function formatDuration(sec?: number): string {
  if (sec == null || !Number.isFinite(sec)) return "";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}
