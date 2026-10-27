import { FileCode2, Film, Globe, Play } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { formatDuration } from "../doc/media";
import { htmlAsset, mediaAsset, pageAspect, pdfAsset, VIRTUAL_SCREEN, type DocState, type Page } from "../doc/types";
import { strokeToSvgPath } from "../ink/geometry";
import { HIGHLIGHTER_ALPHA } from "../ink/palette";
import type { Stroke } from "../ink/types";
import { youtubeThumbUrl } from "../doc/youtube";
import { thumbnailFor } from "../pdf/thumbnails";
import { paintBoxes } from "../view/boxPaint";

interface Props {
  page: Page;
  doc: DocState;
  strokes: Stroke[];
  width: number;
  /** HTML 페이지를 실제로 실행해 미리 보여 줄지 (끄는 중 따라다니는 작은 그림은 끈다) */
  live?: boolean;
}

// 페이지 바의 축소 이미지: PDF 쪽·이미지·HTML 화면(빈 페이지, 웹 주소·동영상은 카드) + 그 위 필기·텍스트 상자
export const PageThumb = memo(function PageThumb({ page, doc, strokes, width, live = true }: Props) {
  const height = Math.round(width / pageAspect(page, doc.assets));
  const hostRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [inView, setInView] = useState(false);
  const [src, setSrc] = useState<string | null>(null);

  // 화면에 보일 때만 PDF 축소 이미지를 만든다 (쪽이 많은 PDF 대비). HTML 미리보기는 보이는 동안만 실행한다
  useEffect(() => {
    const el = hostRef.current!;
    const io = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting) setVisible(true);
      },
      { rootMargin: "200px" },
    );
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
    ctx.globalAlpha = 1;
    // 화면처럼 텍스트 상자는 필기 위에
    paintBoxes(ctx, page, doc.pages, doc.hidden, size);
  }, [strokes, width, height, page, doc.pages, doc.hidden]);

  const grid = page.kind === "blank" && page.background === "grid";
  return (
    <div
      ref={hostRef}
      className={`thumb-page${grid ? " grid" : ""}`}
      style={{ width, height, backgroundSize: grid ? `${width / 40}px ${width / 40}px` : undefined }}
    >
      {src && <img src={src} alt="" draggable={false} />}
      {page.kind === "image" && mediaAsset(doc.assets, page.asset) && (
        <img src={mediaAsset(doc.assets, page.asset)!.url} alt="" draggable={false} decoding="async" />
      )}
      {page.kind === "video" && <VideoThumb page={page} doc={doc} />}
      {page.kind === "html" && <HtmlThumb page={page} doc={doc} width={width} run={live && inView} />}
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

/**
 * HTML 페이지: 실제 화면을 작게 실행해 보여 준다 (스크립트만 허용, 누름·소리·팝업 없음).
 * 못 그리거나 보이지 않을 때는 아이콘 카드, 아래에 파일 이름.
 */
function HtmlThumb({ page, doc, width, run }: { page: Extract<Page, { kind: "html" }>; doc: DocState; width: number; run: boolean }) {
  const asset = htmlAsset(doc.assets, page.asset);
  const screen = VIRTUAL_SCREEN[page.aspect];
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!run) setLoaded(false);
  }, [run]);
  return (
    <span className={`thumb-html${loaded ? " loaded" : ""}`}>
      {!loaded && (
        <span className="thumb-web">
          <FileCode2 size={22} />
        </span>
      )}
      {run && asset && (
        <iframe
          className="thumb-frame"
          title=""
          aria-hidden="true"
          tabIndex={-1}
          srcDoc={asset.html}
          sandbox="allow-scripts"
          style={{ width: screen.width, height: screen.height, transform: `scale(${width / screen.width})` }}
          onLoad={() => setLoaded(true)}
        />
      )}
      <span className="thumb-label">
        <FileCode2 size={10} />
        {asset?.name ?? "HTML"}
      </span>
    </span>
  );
}

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

/** 동영상: 첫 장면 + 재생 표시 + 길이 */
function VideoThumb({ page, doc }: { page: Extract<Page, { kind: "video" }>; doc: DocState }) {
  const asset = mediaAsset(doc.assets, page.asset);
  return (
    <span className="thumb-web youtube">
      {asset?.poster ? <img src={asset.poster} alt="" draggable={false} /> : <Film size={26} />}
      <span className="thumb-play video">
        <Play size={16} fill="currentColor" />
      </span>
      {asset?.duration != null && <span className="thumb-duration">{formatDuration(asset.duration)}</span>}
      {!asset?.poster && <span>{asset?.name ?? "동영상"}</span>}
    </span>
  );
}
