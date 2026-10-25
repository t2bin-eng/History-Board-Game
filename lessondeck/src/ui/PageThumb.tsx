import { FileCode2, Globe, Play } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { htmlAsset, pageAspect, pdfAsset, type DocState, type Page } from "../doc/types";
import { strokeToSvgPath } from "../ink/geometry";
import { HIGHLIGHTER_ALPHA } from "../ink/palette";
import type { Stroke } from "../ink/types";
import { youtubeThumbUrl } from "../doc/youtube";
import { thumbnailFor } from "../pdf/thumbnails";

interface Props {
  page: Page;
  doc: DocState;
  strokes: Stroke[];
  width: number;
}

// 페이지 바의 축소 이미지: PDF 쪽(빈 페이지, 웹앱은 아이콘 카드) + 그 위 필기
export const PageThumb = memo(function PageThumb({ page, doc, strokes, width }: Props) {
  const height = Math.round(width / pageAspect(page, doc.assets));
  const hostRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(null);

  // 화면에 보일 때만 PDF 축소 이미지를 만든다 (쪽이 많은 PDF 대비)
  useEffect(() => {
    const el = hostRef.current!;
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && setVisible(true), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || page.kind !== "pdf") return;
    const asset = pdfAsset(doc.assets, page.asset);
    if (!asset) return;
    let cancelled = false;
    thumbnailFor(asset.doc, asset.id, page.pageIndex)
      .then((url) => !cancelled && setSrc(url))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [visible, page, doc.assets]);

  useEffect(() => {
    const canvas = inkRef.current!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const size = { width, height };
    for (const s of strokes) {
      const d = strokeToSvgPath(s, size);
      if (!d) continue;
      ctx.globalAlpha = s.tool === "highlighter" ? HIGHLIGHTER_ALPHA : 1;
      ctx.fillStyle = s.color;
      ctx.fill(new Path2D(d));
    }
  }, [strokes, width, height]);

  const grid = page.kind === "blank" && page.background === "grid";
  return (
    <div
      ref={hostRef}
      className={`thumb-page${grid ? " grid" : ""}`}
      style={{ width, height, backgroundSize: grid ? `${width / 40}px ${width / 40}px` : undefined }}
    >
      {src && <img src={src} alt="" draggable={false} />}
      {page.kind === "html" && (
        <span className="thumb-web">
          <FileCode2 size={26} />
          <span>{htmlAsset(doc.assets, page.asset)?.name ?? "HTML"}</span>
        </span>
      )}
      {page.kind === "youtube" && <YouTubeThumb page={page} />}
      {page.kind === "url" && (
        <span className="thumb-web">
          <Globe size={26} />
          <span>{hostOf(page.url)}</span>
        </span>
      )}
      <canvas ref={inkRef} style={{ width, height }} />
    </div>
  );
});

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** 유튜브 썸네일(인터넷 필요). 못 불러오면 아이콘 카드 */
function YouTubeThumb({ page }: { page: Extract<Page, { kind: "youtube" }> }) {
  const [failed, setFailed] = useState(false);
  const src = youtubeThumbUrl(page);
  return (
    <span className="thumb-web youtube">
      {src && !failed && <img src={src} alt="" draggable={false} onError={() => setFailed(true)} />}
      <span className="thumb-play">
        <Play size={16} fill="currentColor" />
      </span>
      {(failed || !src) && <span>{page.videoId ? "유튜브 동영상" : "유튜브 재생목록"}</span>}
    </span>
  );
}
