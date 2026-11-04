// Rebuilds the inline map geometry of public/vietnam-history-map.html.
//
// Source data: Natural Earth 1:10m admin-0 countries (public domain), via the
// world-atlas TopoJSON package. Download the two packages once, then run:
//
//   npm pack world-atlas@2.0.2 topojson-client@3.1.0   (into a scratch folder, then untar)
//   node scripts/build-vietnam-map-geo.mjs <countries-10m.json> <topojson-client.js>
//
// The script clips every country to the Indochina / western-Pacific window,
// projects it with Mercator (100 units per degree of longitude), simplifies it
// (Douglas-Peucker) and writes the result into the page's #geo-data block.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [worldPath, topoPath] = process.argv.slice(2);
if (!worldPath || !topoPath) {
  console.error("usage: node scripts/build-vietnam-map-geo.mjs <countries-10m.json> <topojson-client.js>");
  process.exit(1);
}
const topo = (await import(pathToFileURL(path.resolve(topoPath)).href)).default;
const world = JSON.parse(fs.readFileSync(worldPath, "utf8"));
const fc = topo.feature(world, world.objects.countries);

const BBOX = [84, -12, 156, 42]; // lon0, lat0, lon1, lat1 (clip extent, wider than any camera view)
const K = 100; // units per degree of longitude
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180 / Math.PI;
const proj = ([lon, lat]) => [(lon - BBOX[0]) * K, (mercY(BBOX[3]) - mercY(lat)) * K];

function clipRing(ring) {
  const edges = [
    (p) => p[0] >= BBOX[0], (p) => p[0] <= BBOX[2], (p) => p[1] >= BBOX[1], (p) => p[1] <= BBOX[3],
  ];
  const inter = [
    (a, b) => { const t = (BBOX[0] - a[0]) / (b[0] - a[0]); return [BBOX[0], a[1] + t * (b[1] - a[1])]; },
    (a, b) => { const t = (BBOX[2] - a[0]) / (b[0] - a[0]); return [BBOX[2], a[1] + t * (b[1] - a[1])]; },
    (a, b) => { const t = (BBOX[1] - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), BBOX[1]]; },
    (a, b) => { const t = (BBOX[3] - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), BBOX[3]]; },
  ];
  let out = ring.slice(0, -1);
  for (let e = 0; e < 4; e++) {
    const input = out; out = [];
    if (!input.length) break;
    for (let i = 0; i < input.length; i++) {
      const cur = input[i], prev = input[(i + input.length - 1) % input.length];
      const ci = edges[e](cur), pi = edges[e](prev);
      if (ci) { if (!pi) out.push(inter[e](prev, cur)); out.push(cur); }
      else if (pi) out.push(inter[e](prev, cur));
    }
  }
  return out;
}

function dp(points, tol) {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    const [ax, ay] = points[a], [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * points[i][0] - dx * points[i][1] + bx * ay - by * ax) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

function dpRing(pts, tol) {
  let far = 0, fd = -1;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
  const a = dp(pts.slice(0, far + 1), tol), b = dp(pts.slice(far), tol);
  return a.concat(b.slice(1));
}
const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };

const FOCUS = new Set(["704", "418", "116"]);
const out = {};
for (const f of fc.features) {
  const id = f.id; const g = f.geometry; if (!g) continue;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  const focus = FOCUS.has(id);
  const tol = focus ? 0.6 : 2.6;      // projected units (1 unit = 0.01 deg)
  const minArea = focus ? 60 : id === "316" ? 20 : 900;   // drop tiny islands
  let d = "";
  for (const poly of polys) {
    for (const ring of poly.slice(0, 1)) { // outer rings only (no lakes needed)
      const c = clipRing(ring); if (c.length < 3) continue;
      const p = dpRing(c.map(proj).concat([proj(c[0])]), tol).slice(0, -1);
      if (p.length < 3 || area(p) < minArea) continue;
      const r = (v) => Math.round(v * (focus ? 10 : 1)) / (focus ? 10 : 1);
      d += "M" + p.map(([x, y]) => r(x) + " " + r(y)).join("L") + "Z";
    }
  }
  if (d) out[id] = { name: f.properties.name, d };
}
const meta = { bbox: BBOX, k: K, width: (BBOX[2] - BBOX[0]) * K, height: (mercY(BBOX[3]) - mercY(BBOX[1])) * K };
const json = JSON.stringify({ meta, countries: out });
const page = fileURLToPath(new URL("../public/vietnam-history-map.html", import.meta.url));
const html = fs.readFileSync(page, "utf8");
const re = /(<script type="application\/json" id="geo-data">)[\s\S]*?(<\/script>)/;
if (!re.test(html)) throw new Error("geo-data block not found in " + page);
fs.writeFileSync(page, html.replace(re, (_, open, close) => open + json + close));
console.log(`wrote ${Object.keys(out).length} countries, ${(json.length / 1024).toFixed(1)} KB of geometry`);
