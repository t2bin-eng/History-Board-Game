import { useCallback, useEffect, useRef, useState } from "react";
import { AI_DOC_ID, openAiScratch, releaseAiScratch, type AiRequest } from "./doc/aiScratch";
import type { DocState } from "./doc/types";
import { Editor } from "./Editor";
import { autoCheckDue, checkForUpdate, isSkipped, onOpenUpdateDialog, openUpdateDialog } from "./lib/appUpdate";
import { isNativeApp, showToast } from "./lib/platform";
import { clearRenderCache } from "./pdf/renderCache";
import { clearThumbnails } from "./pdf/thumbnails";
import { getMeta, setMeta } from "./store/db";
import { onDocChange, openDoc, releaseDoc, type OpenedDoc } from "./store/docStore";
import { initSync } from "./sync/syncEngine";
import { HomeScreen } from "./ui/HomeScreen";
import { SyncButton, SyncPanel } from "./ui/SyncPanel";
import { Toaster } from "./ui/Toaster";
import { UpdateDialog } from "./ui/UpdateDialog";

type Route =
  | { screen: "loading" }
  | { screen: "home" }
  | { screen: "editor"; docId: string; opened: OpenedDoc; version: number; ai?: boolean; resumeLecture?: boolean };

// 문서 목록 ↔ 편집 화면. 앱을 열면 마지막으로 보던 문서를 바로 연다.
export default function App() {
  const [route, setRoute] = useState<Route>({ screen: "loading" });
  const [syncOpen, setSyncOpen] = useState(false);
  /** 업데이트 창 (v0.34): 버전 표시·새 버전 알림에서 */
  const [updateOpen, setUpdateOpen] = useState(false);
  const editorDoc = useRef<DocState | null>(null);
  const routeRef = useRef(route);
  routeRef.current = route;
  /** AI 창(v0.31)을 연 동안: 돌아갈 문서(화면용 원본·필기 그대로)와 AI 창의 임시 문서 */
  const aiBack = useRef<{ docId: string; opened: OpenedDoc; lecture: boolean } | null>(null);
  const aiDoc = useRef<DocState | null>(null);

  const closeCurrent = () => {
    if (editorDoc.current) releaseDoc(editorDoc.current);
    editorDoc.current = null;
    clearRenderCache();
    clearThumbnails();
  };

  const open = useCallback(async (docId: string, notice?: string) => {
    setRoute({ screen: "loading" });
    // 편집 화면이 내려간 뒤에 PDF·object URL을 정리한다
    await new Promise((r) => setTimeout(r));
    closeCurrent();
    const opened = await openDoc(docId).catch((err) => {
      console.error(err);
      return null;
    });
    if (!opened) {
      await setMeta("lastDocId", null);
      setRoute({ screen: "home" });
      showToast("문서를 열 수 없습니다");
      return;
    }
    editorDoc.current = opened.doc;
    await setMeta("lastDocId", docId);
    setRoute({ screen: "editor", docId, opened, version: Date.now() });
    if (notice) showToast(notice);
  }, []);

  const goHome = useCallback(() => {
    closeCurrent();
    void setMeta("lastDocId", null);
    setRoute({ screen: "home" });
  }, []);

  useEffect(() => {
    void initSync();
    getMeta<string | null>("lastDocId").then((id) => (id ? open(id) : setRoute({ screen: "home" })));
  }, [open]);

  // 앱 안 업데이트 (v0.34): 버전 표시를 누르면 창, 안드로이드 앱은 켤 때 6시간에 한 번 새 버전을 확인해 알린다
  useEffect(() => onOpenUpdateDialog(() => setUpdateOpen(true)), []);
  useEffect(() => {
    if (!isNativeApp || !autoCheckDue()) return;
    const t = window.setTimeout(() => {
      checkForUpdate()
        .then((r) => {
          if (r.newer && r.latest && !isSkipped(r.latest.version)) {
            showToast(`새 버전 v${r.latest.version}이 있습니다`, { label: "업데이트", run: openUpdateDialog });
          }
        })
        .catch(() => {
          // 인터넷이 없거나 확인 횟수 제한: 다음에 다시
        });
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  // 다른 기기에서 고친 내용을 받았거나 지웠으면, 열려 있는 문서를 다시 연다
  useEffect(
    () =>
      onDocChange((docId, kind) => {
        const r = routeRef.current;
        if (kind !== "remote" || r.screen !== "editor" || r.docId !== docId) return;
        void open(docId, "다른 기기에서 고친 내용을 불러왔습니다");
      }),
    [open],
  );

  // AI로 보내기: 문서는 닫지 않고(PDF·그림을 그대로 둔 채) 임시 문서 화면으로 바꾼다
  const startAi = useCallback(async (req: AiRequest) => {
    const r = routeRef.current;
    if (r.screen !== "editor" || r.ai) return;
    const main = editorDoc.current ?? r.opened.doc;
    let scratch: OpenedDoc;
    try {
      scratch = await openAiScratch(req, main);
    } catch (err) {
      console.error(err);
      showToast("AI 창을 열지 못했습니다");
      return;
    }
    aiBack.current = { docId: r.docId, opened: { doc: main, ink: req.ink, missingAssets: [] }, lecture: req.lecture };
    aiDoc.current = scratch.doc;
    setRoute({ screen: "editor", docId: AI_DOC_ID, opened: scratch, version: Date.now(), ai: true });
  }, []);

  const endAi = useCallback(() => {
    const back = aiBack.current;
    if (aiDoc.current) releaseAiScratch(aiDoc.current, back?.opened.doc ?? { assets: {} } as DocState);
    aiDoc.current = null;
    aiBack.current = null;
    if (!back) {
      setRoute({ screen: "home" });
      return;
    }
    editorDoc.current = back.opened.doc;
    setRoute({ screen: "editor", docId: back.docId, opened: back.opened, version: Date.now(), resumeLecture: back.lecture });
  }, []);
  const aiProps = useRef({ onClose: endAi }).current;

  const syncButton = <SyncButton onClick={() => setSyncOpen(true)} />;

  return (
    <>
      {route.screen === "loading" && (
        <div className="app loading-screen">
          <span className="spinner" aria-hidden="true" /> 불러오는 중…
        </div>
      )}
      {route.screen === "home" && <HomeScreen onOpen={(id) => open(id)} headerExtra={syncButton} />}
      {route.screen === "editor" && route.ai && <div className="ai-backdrop" aria-hidden="true" />}
      {route.screen === "editor" && (
        <Editor
          key={`${route.docId}:${route.version}`}
          opened={route.opened}
          onHome={goHome}
          onDocChange={route.ai ? (doc) => (aiDoc.current = doc) : (doc) => (editorDoc.current = doc)}
          headerExtra={route.ai ? undefined : syncButton}
          onAi={route.ai ? undefined : startAi}
          ai={route.ai ? aiProps : undefined}
          resumeLecture={route.resumeLecture}
        />
      )}
      {syncOpen && <SyncPanel onClose={() => setSyncOpen(false)} />}
      {updateOpen && <UpdateDialog onClose={() => setUpdateOpen(false)} />}
      <Toaster />
    </>
  );
}
