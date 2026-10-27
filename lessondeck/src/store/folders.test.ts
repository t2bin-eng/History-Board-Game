import { describe, expect, it } from "vitest";
import { emptyLibrary, libraryKey, mergeLibrary, parseLibrary, uniqueName, viewLibrary, type Folder, type Library } from "./folders";

const folder = (id: string, parentId: string | null, updatedAt = 1, extra: Partial<Folder> = {}): Folder => ({
  id,
  name: id.toUpperCase(),
  parentId,
  createdAt: 1,
  updatedAt,
  ...extra,
});

const lib = (folders: Folder[], placements: Record<string, [string | null, number]> = {}): Library => ({
  version: 1,
  folders: Object.fromEntries(folders.map((f) => [f.id, f])),
  placements: Object.fromEntries(Object.entries(placements).map(([d, [folderId, updatedAt]]) => [d, { folderId, updatedAt }])),
});

describe("mergeLibrary", () => {
  it("폴더·배치마다 더 최근 것을 고른다", () => {
    const a = lib([folder("a", null, 5, { name: "새 이름" }), folder("b", null, 1)], { d1: ["a", 3], d2: [null, 9] });
    const b = lib([folder("a", null, 2), folder("b", "a", 7), folder("c", null, 1)], { d1: ["b", 4], d2: ["a", 1] });
    const m = mergeLibrary(a, b);
    expect(m.folders.a.name).toBe("새 이름");
    expect(m.folders.b.parentId).toBe("a");
    expect(m.folders.c).toBeDefined();
    expect(m.placements.d1.folderId).toBe("b");
    expect(m.placements.d2.folderId).toBeNull();
  });

  it("순서와 무관하게 같은 결과 (같은 시각이면 지운 쪽)", () => {
    const a = lib([folder("a", null, 5, { name: "가" }), folder("x", null, 3)], { d: ["a", 2] });
    const b = lib([folder("a", null, 5, { name: "나" }), folder("x", null, 3, { deleted: true })], { d: ["x", 2] });
    expect(libraryKey(mergeLibrary(a, b))).toBe(libraryKey(mergeLibrary(b, a)));
    expect(mergeLibrary(a, b).folders.x.deleted).toBe(true);
    expect(libraryKey(mergeLibrary(a, a))).toBe(libraryKey(a));
  });

  it("지운 뒤에 다른 기기에서 고친 폴더는 되살아난다", () => {
    const a = lib([folder("a", null, 5, { deleted: true })]);
    const b = lib([folder("a", null, 8, { name: "고친 이름" })]);
    expect(mergeLibrary(a, b).folders.a.deleted).toBeUndefined();
  });
});

describe("viewLibrary", () => {
  it("지운 폴더 안의 것은 살아 있는 가장 가까운 윗 폴더에 보인다", () => {
    const v = viewLibrary(
      lib([folder("a", null), folder("b", "a", 1, { deleted: true }), folder("c", "b"), folder("d", "zzz")], { d1: ["b", 1], d2: ["gone", 1], d3: ["c", 1] }),
    );
    expect(v.parentOf("c")).toBe("a");
    expect(v.parentOf("d")).toBeNull();
    expect(v.folderOfDoc("d1")).toBe("a");
    expect(v.folderOfDoc("d2")).toBeNull();
    expect(v.folderOfDoc("d3")).toBe("c");
    expect(v.folderOfDoc("unknown")).toBeNull();
    expect(v.children("a").map((f) => f.id)).toEqual(["c"]);
    expect(v.path("c").map((f) => f.id)).toEqual(["a", "c"]);
    expect([...v.subtree("a")].sort()).toEqual(["a", "c"]);
    expect(v.isLive("b")).toBe(false);
  });

  it("서로가 서로의 안에 든 고리는 맨 위로 꺼낸다", () => {
    const v = viewLibrary(lib([folder("a", "b"), folder("b", "a"), folder("c", "a")]));
    expect(v.parentOf("a")).toBeNull();
    expect(v.parentOf("b")).toBeNull();
    expect(v.parentOf("c")).toBe("a");
    expect(v.path("c").map((f) => f.id)).toEqual(["a", "c"]);
  });

  it("이름은 숫자를 숫자로 읽어 정렬하고, 겹치면 번호를 붙인다", () => {
    const v = viewLibrary(lib([folder("x", null, 1, { name: "10단원" }), folder("y", null, 1, { name: "2단원" }), folder("z", null, 1, { name: "새 폴더" })]));
    expect(v.children(null).map((f) => f.name)).toEqual(["2단원", "10단원", "새 폴더"]);
    expect(uniqueName(v, null, "새 폴더")).toBe("새 폴더 2");
    expect(uniqueName(v, "x", "새 폴더")).toBe("새 폴더");
  });
});

describe("parseLibrary", () => {
  it("이상한 값은 버린다", () => {
    expect(parseLibrary(null)).toEqual(emptyLibrary());
    const p = parseLibrary({ folders: { a: { name: "가", parentId: 3, updatedAt: "7" }, b: { parentId: null } }, placements: { d: { folderId: 5 } } });
    expect(p.folders.a).toEqual({ id: "a", name: "가", parentId: null, createdAt: 0, updatedAt: 7 });
    expect(p.folders.b).toBeUndefined();
    expect(p.placements.d).toEqual({ folderId: null, updatedAt: 0 });
  });
});
