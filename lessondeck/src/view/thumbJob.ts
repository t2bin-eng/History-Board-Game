import { useEffect } from "react";
import type { DocRecord } from "../store/db";
import { openDoc, releaseDoc, setThumb } from "../store/docStore";
import type { CoverChoice } from "../store/folders";
import { snapshotPage, thumbTarget } from "./pageSnapshot";

// 홈 카드 썸네일 그림을 이 기기에서 새로 만든다 (v0.22).
// 다른 기기에서 썸네일 페이지를 골랐거나, 표지를 "페이지 그림"으로 했는데 이 기기에서 연 적이 없는 문서.

/** 이번 실행에서 이미 해 본 것 (못 만들어도 되풀이하지 않게) */
const tried = new Set<string>();

/** 이 문서의 카드 그림을 새로 만들어야 하나. 만들 페이지 표시(고른 페이지 id 또는 "first") */
export function thumbNeed(doc: DocRecord, choice: CoverChoice | undefined): string | null {
  if (!choice) return null;
  if (choice.page) {
    if (doc.thumb && doc.thumbPage === choice.page) return null;
    return doc.manifest.pages.some((p) => p.id === choice.page) ? choice.page : null;
  }
  if (choice.cover === "page" && !doc.thumb) return "first";
  return null;
}

async function rebuild(docId: string, need: string): Promise<void> {
  const opened = await openDoc(docId);
  if (!opened) return;
  try {
    const target = thumbTarget(opened.doc, need === "first" ? undefined : need);
    if (!target) return;
    // 원본을 아직 받지 못한 페이지는 나중에 (빈 그림을 남기지 않게)
    if ("asset" in target && opened.missingAssets.includes(target.asset)) return;
    const url = await snapshotPage(target, opened.doc, opened.ink[target.id]?.present ?? []);
    if (url) await setThumb(docId, url, target.id);
  } finally {
    releaseDoc(opened.doc);
  }
}

/** 홈이 보이는 동안 필요한 카드 그림을 하나씩 만든다 */
export function useThumbRebuild(docs: DocRecord[] | null, covers: Record<string, CoverChoice>) {
  useEffect(() => {
    if (!docs) return;
    const todo = docs.flatMap((d) => {
      const need = thumbNeed(d, covers[d.id]);
      const key = `${d.id}:${need}`;
      return need && !tried.has(key) ? [{ id: d.id, need, key }] : [];
    });
    if (!todo.length) return;
    let cancelled = false;
    void (async () => {
      for (const job of todo) {
        if (cancelled) return;
        tried.add(job.key);
        await rebuild(job.id, job.need).catch((err) => console.warn("썸네일을 만들지 못했습니다", err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docs, covers]);
}
