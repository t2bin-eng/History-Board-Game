import { useCallback, useEffect, useRef, useState } from "react";
import type { DocState } from "./doc/types";
import { Editor } from "./Editor";
import { showToast } from "./lib/platform";
import { clearRenderCache } from "./pdf/renderCache";
import { clearThumbnails } from "./pdf/thumbnails";
import { getMeta, setMeta } from "./store/db";
import { onDocChange, openDoc, releaseDoc, type OpenedDoc } from "./store/docStore";
import { initSync } from "./sync/syncEngine";
import { HomeScreen } from "./ui/HomeScreen";
import { SyncButton, SyncPanel } from "./ui/SyncPanel";
import { Toaster } from "./ui/Toaster";

type Route =
  | { screen: "loading" }
  | { screen: "home" }
  | { screen: "editor"; docId: string; opened: OpenedDoc; version: number };

// 문서 목록 ↔ 편집 화면. 앱을 열면 마지막으로 보던 문서를 바로 연다.
export default function App() {
  const [route, setRoute] = useState<Route>({ screen: "loading" });
  const [syncOpen, setSyncOpen] = useState(false);
  const editorDoc = useRef<DocState | null>(null);
  const routeRef = useRef(route);
  routeRef.current = route;

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

  const syncButton = <SyncButton onClick={() => setSyncOpen(true)} />;

  return (
    <>
      {route.screen === "loading" && (
        <div className="app loading-screen">
          <span className="spinner" aria-hidden="true" /> 불러오는 중…
        </div>
      )}
      {route.screen === "home" && <HomeScreen onOpen={(id) => open(id)} headerExtra={syncButton} />}
      {route.screen === "editor" && (
        <Editor
          key={`${route.docId}:${route.version}`}
          opened={route.opened}
          onHome={goHome}
          onDocChange={(doc) => (editorDoc.current = doc)}
          headerExtra={syncButton}
        />
      )}
      {syncOpen && <SyncPanel onClose={() => setSyncOpen(false)} />}
      <Toaster />
    </>
  );
}
