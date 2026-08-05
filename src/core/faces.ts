/**
 * Extração de faces a partir do grafo de arestas.
 *
 * Este é o coração do comportamento "SketchUp": nenhuma face é armazenada.
 * A cada mudança nas arestas, reconstruímos o arranjo planar — para cada plano
 * encontrado no modelo, projetamos as arestas coplanares em 2D e percorremos
 * os meio-arcos (half-edges) para achar os ciclos mínimos. Ciclos com área
 * positiva viram faces; ciclos negativos contidos em uma face viram furos.
 *
 * Consequências que saem de graça:
 *  - fechar um laço cria a face;
 *  - desenhar um retângulo sobre uma face a divide em duas;
 *  - apagar uma aresta funde as faces vizinhas;
 *  - um retângulo dentro de outro vira furo (vão de janela).
 */

import type { Edge, Face, ID, Vertex } from './types';
import {
  PLANE_TOL,
  cross3,
  dot3,
  norm3,
  planeBasis,
  pointInPolygon2,
  projectToPlane,
  q,
  signedArea,
  sub3,
  type Vec2,
  type Vec3,
} from './math';

interface Cycle {
  loop: ID[];
  pts2: Vec2[];
  area: number;
}

export function faceKey(loop: ID[], holes: ID[][] = []): string {
  const outer = [...loop].sort((a, b) => a - b).join('.');
  if (!holes.length) return outer;
  const inner = holes
    .map((h) => [...h].sort((a, b) => a - b).join('.'))
    .sort()
    .join('/');
  return `${outer}|${inner}`;
}

/** Remove "espinhos" (arestas soltas percorridas ida e volta) do ciclo. */
function pruneSpikes(loop: ID[]): ID[] {
  const out = loop.slice();
  let changed = true;
  while (changed && out.length >= 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const prev = out[(i - 1 + out.length) % out.length];
      const next = out[(i + 1) % out.length];
      if (prev === next) {
        // remove i e next (a ponta e o retorno)
        const j = (i + 1) % out.length;
        const rm = [i, j].sort((a, b) => b - a);
        for (const k of rm) out.splice(k, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

/** Um ponto estritamente interior a um polígono simples (para teste de furo). */
function interiorPoint(poly: Vec2[]): Vec2 {
  const n = poly.length;
  if (n < 3) return poly[0] ?? [0, 0];
  // vértice mais à esquerda-baixo é sempre convexo
  let vi = 0;
  for (let i = 1; i < n; i++) {
    if (poly[i][0] < poly[vi][0] || (poly[i][0] === poly[vi][0] && poly[i][1] < poly[vi][1])) vi = i;
  }
  const a = poly[(vi - 1 + n) % n];
  const b = poly[vi];
  const c = poly[(vi + 1) % n];
  const tri = (p: Vec2) => {
    const s = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const t = (c[0] - b[0]) * (p[1] - b[1]) - (c[1] - b[1]) * (p[0] - b[0]);
    const u = (a[0] - c[0]) * (p[1] - c[1]) - (a[1] - c[1]) * (p[0] - c[0]);
    return (s >= 0 && t >= 0 && u >= 0) || (s <= 0 && t <= 0 && u <= 0);
  };
  let best: Vec2 | null = null;
  let bestD = -Infinity;
  for (let i = 0; i < n; i++) {
    if (i === vi || i === (vi - 1 + n) % n || i === (vi + 1) % n) continue;
    const p = poly[i];
    if (!tri(p)) continue;
    const d = Math.abs((c[0] - a[0]) * (p[1] - a[1]) - (c[1] - a[1]) * (p[0] - a[0]));
    if (d > bestD) {
      bestD = d;
      best = p;
    }
  }
  const other = best ?? a;
  const partner = best ? b : c;
  return [(other[0] + partner[0]) / 2, (other[1] + partner[1]) / 2];
}

interface PlaneDef {
  n: Vec3;
  d: number;
}

function canonicalPlane(n: Vec3, point: Vec3): PlaneDef | null {
  let nn = norm3(n);
  if (!nn[0] && !nn[1] && !nn[2]) return null;
  const first = Math.abs(nn[0]) > 1e-6 ? nn[0] : Math.abs(nn[1]) > 1e-6 ? nn[1] : nn[2];
  if (first < 0) nn = [-nn[0], -nn[1], -nn[2]];
  return { n: nn, d: dot3(nn, point) };
}

const planeKey = (p: PlaneDef) => `${q(p.n[0], 3)},${q(p.n[1], 3)},${q(p.n[2], 3)},${q(p.d, 3)}`;

/** Enumera todos os planos candidatos: pares de arestas incidentes num vértice. */
function collectPlanes(vertices: Map<ID, Vertex>, edges: Map<ID, Edge>): PlaneDef[] {
  const incident = new Map<ID, ID[]>();
  for (const e of edges.values()) {
    (incident.get(e.a) ?? incident.set(e.a, []).get(e.a)!).push(e.id);
    (incident.get(e.b) ?? incident.set(e.b, []).get(e.b)!).push(e.id);
  }
  const planes = new Map<string, PlaneDef>();
  for (const [vid, list] of incident) {
    const origin = vertices.get(vid)!.p;
    const dirs: Vec3[] = [];
    for (const eid of list.slice(0, 12)) {
      const e = edges.get(eid)!;
      const other = e.a === vid ? e.b : e.a;
      dirs.push(norm3(sub3(vertices.get(other)!.p, origin)));
    }
    for (let i = 0; i < dirs.length; i++) {
      for (let j = i + 1; j < dirs.length; j++) {
        const pl = canonicalPlane(cross3(dirs[i], dirs[j]), origin);
        if (!pl) continue;
        const k = planeKey(pl);
        if (!planes.has(k)) planes.set(k, pl);
      }
    }
  }
  return [...planes.values()];
}

/** Percorre o arranjo planar de um conjunto de arestas coplanares. */
function traversePlane(
  plane: PlaneDef,
  planeEdges: Edge[],
  vertices: Map<ID, Vertex>,
): { positives: Cycle[]; negatives: Cycle[] } {
  const [u, v] = planeBasis(plane.n);
  const origin: Vec3 = [plane.n[0] * plane.d, plane.n[1] * plane.d, plane.n[2] * plane.d];
  const p2 = new Map<ID, Vec2>();
  const at = (id: ID): Vec2 => {
    let p = p2.get(id);
    if (!p) {
      p = projectToPlane(vertices.get(id)!.p, origin, u, v);
      p2.set(id, p);
    }
    return p;
  };

  const from: ID[] = [];
  const to: ID[] = [];
  for (const e of planeEdges) {
    from.push(e.a, e.b);
    to.push(e.b, e.a);
  }
  const count = from.length;
  if (count < 6) return { positives: [], negatives: [] };

  const outgoing = new Map<ID, number[]>();
  for (let h = 0; h < count; h++) {
    const arr = outgoing.get(from[h]) ?? [];
    arr.push(h);
    outgoing.set(from[h], arr);
  }
  const angle = new Float64Array(count);
  for (let h = 0; h < count; h++) {
    const a = at(from[h]);
    const b = at(to[h]);
    angle[h] = Math.atan2(b[1] - a[1], b[0] - a[0]);
  }
  const slot = new Int32Array(count);
  for (const arr of outgoing.values()) {
    arr.sort((x, y) => angle[x] - angle[y]);
    arr.forEach((h, i) => (slot[h] = i));
  }
  const nextOf = (h: number): number => {
    const twin = h ^ 1;
    const arr = outgoing.get(from[twin])!;
    return arr[(slot[twin] - 1 + arr.length) % arr.length];
  };

  const seen = new Uint8Array(count);
  const positives: Cycle[] = [];
  const negatives: Cycle[] = [];
  for (let h0 = 0; h0 < count; h0++) {
    if (seen[h0]) continue;
    const loop: ID[] = [];
    let h = h0;
    let guard = 0;
    do {
      seen[h] = 1;
      loop.push(from[h]);
      h = nextOf(h);
      if (++guard > count + 4) break;
    } while (h !== h0);
    const pruned = pruneSpikes(loop);
    if (pruned.length < 3) continue;
    const pts2 = pruned.map(at);
    const area = signedArea(pts2);
    if (Math.abs(area) < 1e-9) continue;
    const cyc: Cycle = { loop: pruned, pts2, area };
    if (area > 0) positives.push(cyc);
    else negatives.push(cyc);
  }
  return { positives, negatives };
}

export function extractFaces(
  vertices: Map<ID, Vertex>,
  edges: Map<ID, Edge>,
  suppressed?: ReadonlySet<string>,
): Face[] {
  if (edges.size < 3) return [];
  const allEdges = [...edges.values()];
  const planes = collectPlanes(vertices, edges);
  const result: Face[] = [];
  const seenKeys = new Set<string>();

  for (const plane of planes) {
    const planeEdges: Edge[] = [];
    for (const e of allEdges) {
      const pa = vertices.get(e.a);
      const pb = vertices.get(e.b);
      if (!pa || !pb) continue;
      if (Math.abs(dot3(plane.n, pa.p) - plane.d) > PLANE_TOL) continue;
      if (Math.abs(dot3(plane.n, pb.p) - plane.d) > PLANE_TOL) continue;
      planeEdges.push(e);
    }
    if (planeEdges.length < 3) continue;

    const { positives, negatives } = traversePlane(plane, planeEdges, vertices);
    if (!positives.length) continue;

    const [pu, pv] = planeBasis(plane.n);
    const pOrigin: Vec3 = [plane.n[0] * plane.d, plane.n[1] * plane.d, plane.n[2] * plane.d];
    positives.sort((a, b) => a.area - b.area);
    const holesFor = new Map<Cycle, ID[][]>();
    for (const neg of negatives) {
      const size = Math.abs(neg.area);
      const probe = interiorPoint([...neg.pts2].reverse());
      let host: Cycle | null = null;
      for (const pos of positives) {
        if (pos.area <= size + 1e-9) continue;
        if (pointInPolygon2(probe, pos.pts2)) {
          host = pos;
          break; // positives ordenadas por área: a primeira que contém é a menor
        }
      }
      if (!host) continue;
      const list = holesFor.get(host) ?? [];
      list.push(neg.loop);
      holesFor.set(host, list);
    }

    for (const pos of positives) {
      const holes = holesFor.get(pos) ?? [];
      const key = faceKey(pos.loop, holes);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const pts3 = pos.loop.map((id) => vertices.get(id)!.p);
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (const p of pts3) {
        cx += p[0];
        cy += p[1];
        cz += p[2];
      }
      const n = pts3.length;
      let holeArea = 0;
      for (const h of holes) {
        const hp = h.map((id) => projectToPlane(vertices.get(id)!.p, pOrigin, pu, pv));
        holeArea += Math.abs(signedArea(hp));
      }
      result.push({
        key,
        loop: pos.loop,
        holes,
        normal: plane.n,
        center: [cx / n, cy / n, cz / n],
        area: Math.max(0, pos.area - holeArea),
      });
    }
  }

  // As faces apagadas saem antes de orientar: se ficassem, as arestas de um
  // vão teriam três faces e a casca não seria percorrida por inteiro.
  const live = suppressed ? result.filter((f) => !suppressed.has(f.key)) : result;
  orientShells(live, vertices);
  return live;
}

/**
 * Deixa cada casca fechada com as normais para fora, para que o lado "frente"
 * (branco) fique visível por fora e o "verso" (azul) por dentro.
 */
function orientShells(faces: Face[], vertices: Map<ID, Vertex>): void {
  if (!faces.length) return;
  // Os furos entram na adjacência: sem isso, o miolo de uma parede oca fica
  // desconectado do anel de topo e a orientação sai invertida.
  const loopsOf = (f: Face): ID[][] => [f.loop, ...f.holes];
  const edgeMap = new Map<string, { fi: number; dir: 1 | -1 }[]>();
  faces.forEach((f, fi) => {
    for (const loop of loopsOf(f)) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        const list = edgeMap.get(key) ?? [];
        list.push({ fi, dir: a < b ? 1 : -1 });
        edgeMap.set(key, list);
      }
    }
  });

  const flip = new Int8Array(faces.length).fill(0);
  const visited = new Uint8Array(faces.length);
  for (let start = 0; start < faces.length; start++) {
    if (visited[start]) continue;
    const component: number[] = [];
    const stack = [start];
    visited[start] = 1;
    while (stack.length) {
      const fi = stack.pop()!;
      component.push(fi);
      for (const loop of loopsOf(faces[fi])) {
        for (let i = 0; i < loop.length; i++) {
          const a = loop[i];
          const b = loop[(i + 1) % loop.length];
          const key = a < b ? `${a}_${b}` : `${b}_${a}`;
          const list = edgeMap.get(key);
          if (!list || list.length !== 2) continue;
          const other = list.find((x) => x.fi !== fi);
          if (!other || visited[other.fi]) continue;
          const mine = list.find((x) => x.fi === fi)!;
          const consistent = mine.dir !== other.dir;
          flip[other.fi] = consistent ? flip[fi] : flip[fi] ? 0 : 1;
          visited[other.fi] = 1;
          stack.push(other.fi);
        }
      }
    }

    // volume com sinal do componente
    let vol = 0;
    for (const fi of component) {
      for (const raw of loopsOf(faces[fi])) {
        const loop = flip[fi] ? [...raw].reverse() : raw;
        const p0 = vertices.get(loop[0])!.p;
        for (let i = 1; i < loop.length - 1; i++) {
          const p1 = vertices.get(loop[i])!.p;
          const p2 = vertices.get(loop[i + 1])!.p;
          vol += dot3(p0, cross3(p1, p2)) / 6;
        }
      }
    }
    if (vol < -1e-9) for (const fi of component) flip[fi] = flip[fi] ? 0 : 1;
  }

  faces.forEach((f, fi) => {
    if (!flip[fi]) return;
    f.loop = [...f.loop].reverse();
    f.holes = f.holes.map((h) => [...h].reverse());
    f.normal = [-f.normal[0], -f.normal[1], -f.normal[2]];
  });
}
