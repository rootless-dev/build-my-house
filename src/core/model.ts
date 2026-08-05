/**
 * O modelo: um grafo de vértices e arestas. As faces são derivadas (ver
 * `faces.ts`). Toda operação de desenho passa por `addSegment`, que quebra
 * arestas em cruzamentos e funde pontos coincidentes — é isso que faz o
 * desenho "grudar" na geometria existente, como no SketchUp.
 */

import { extractFaces } from './faces';
import type { Anchor, Dimension, Edge, EntityRef, Face, Guide, ID, Material, ModelSnapshot, Note, Vertex } from './types';
import {
  MERGE_TOL,
  PLANE_TOL,
  add3,
  centroid3,
  closestOnSegment,
  cross3,
  dist3,
  distToPolygon2,
  dot3,
  len3,
  lineLineClosest,
  mul3,
  norm3,
  planeBasis,
  pointInPolygon2,
  projectToPlane,
  q,
  sub3,
  type Vec3,
} from './math';

export const DEFAULT_MATERIALS: Material[] = [
  { id: 'concreto', name: 'Concreto aparente', color: '#c9c6bd', opacity: 1, roughness: 0.92, metalness: 0, group: 'Estrutura' },
  { id: 'reboco', name: 'Reboco branco', color: '#f2efe8', opacity: 1, roughness: 0.95, metalness: 0, group: 'Estrutura' },
  { id: 'tijolo', name: 'Tijolo à vista', color: '#a5543c', opacity: 1, roughness: 0.9, metalness: 0, group: 'Alvenaria' },
  { id: 'madeira', name: 'Madeira cumaru', color: '#8a5a2b', opacity: 1, roughness: 0.6, metalness: 0, group: 'Acabamento' },
  { id: 'piso', name: 'Piso cimentício', color: '#b9b6ae', opacity: 1, roughness: 0.75, metalness: 0, group: 'Acabamento' },
  { id: 'telha', name: 'Telha cerâmica', color: '#b4552f', opacity: 1, roughness: 0.85, metalness: 0, group: 'Cobertura' },
  { id: 'metal', name: 'Metalon grafite', color: '#3d4148', opacity: 1, roughness: 0.35, metalness: 0.8, group: 'Esquadria' },
  { id: 'vidro', name: 'Vidro comum', color: '#9fc6d8', opacity: 0.28, roughness: 0.05, metalness: 0, group: 'Esquadria' },
  { id: 'grama', name: 'Grama', color: '#6f8f4a', opacity: 1, roughness: 1, metalness: 0, group: 'Entorno' },
];

export class Model {
  vertices = new Map<ID, Vertex>();
  edges = new Map<ID, Edge>();
  /** Faces apagadas explicitamente (ou vazadas por push/pull). */
  suppressed = new Set<string>();
  faceMaterials = new Map<string, string>();
  materials = new Map<string, Material>();
  /** Cotas, textos e guias: anotações que não entram no grafo de arestas. */
  dimensions = new Map<ID, Dimension>();
  notes = new Map<ID, Note>();
  guides = new Map<ID, Guide>();
  /** Incrementa a cada mudança topológica — invalida o cache de faces. */
  revision = 0;

  private nextId = 1;
  private faceCache: { rev: number; faces: Face[] } | null = null;
  private vertexGrid = new Map<string, ID[]>();

  constructor() {
    for (const m of DEFAULT_MATERIALS) this.materials.set(m.id, { ...m });
  }

  // ---------------------------------------------------------------- consultas

  faces(): Face[] {
    if (this.faceCache && this.faceCache.rev === this.revision) return this.faceCache.faces;
    const faces = extractFaces(this.vertices, this.edges, this.suppressed);
    this.faceCache = { rev: this.revision, faces };
    return faces;
  }

  faceLoopPoints(face: Face): Vec3[] {
    return face.loop.map((id) => this.vertices.get(id)!.p);
  }

  vertexPos(id: ID): Vec3 {
    return this.vertices.get(id)!.p;
  }

  edgePoints(id: ID): [Vec3, Vec3] {
    const e = this.edges.get(id)!;
    return [this.vertices.get(e.a)!.p, this.vertices.get(e.b)!.p];
  }

  bounds(): { min: Vec3; max: Vec3 } | null {
    if (!this.vertices.size) return null;
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const v of this.vertices.values()) {
      for (let i = 0; i < 3; i++) {
        if (v.p[i] < min[i]) min[i] = v.p[i];
        if (v.p[i] > max[i]) max[i] = v.p[i];
      }
    }
    return { min, max };
  }

  /** Área total das faces, em m². */
  totalArea(): number {
    return this.faces().reduce((s, f) => s + f.area, 0);
  }

  // ------------------------------------------------------------------ vértices

  private gridKey(p: Vec3): string {
    const c = 1 / (MERGE_TOL * 4);
    return `${Math.round(p[0] * c)}|${Math.round(p[1] * c)}|${Math.round(p[2] * c)}`;
  }

  private gridNeighbors(p: Vec3): ID[] {
    const c = 1 / (MERGE_TOL * 4);
    const bx = Math.round(p[0] * c);
    const by = Math.round(p[1] * c);
    const bz = Math.round(p[2] * c);
    const out: ID[] = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const hit = this.vertexGrid.get(`${bx + dx}|${by + dy}|${bz + dz}`);
          if (hit) out.push(...hit);
        }
    return out;
  }

  private indexVertex(v: Vertex): void {
    const k = this.gridKey(v.p);
    const arr = this.vertexGrid.get(k) ?? [];
    arr.push(v.id);
    this.vertexGrid.set(k, arr);
  }

  private reindexAll(): void {
    this.vertexGrid.clear();
    for (const v of this.vertices.values()) this.indexVertex(v);
  }

  findVertexAt(p: Vec3, tol = MERGE_TOL): ID | null {
    let best: ID | null = null;
    let bestD = tol;
    for (const id of this.gridNeighbors(p)) {
      const v = this.vertices.get(id);
      if (!v) continue;
      const d = dist3(v.p, p);
      if (d <= bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  /** Cria (ou reaproveita) um vértice, quebrando arestas em que o ponto cai. */
  addPoint(p: Vec3): ID {
    const existing = this.findVertexAt(p);
    if (existing !== null) return existing;
    const id = this.nextId++;
    const v: Vertex = { id, p: [q(p[0], 6), q(p[1], 6), q(p[2], 6)] };
    this.vertices.set(id, v);
    this.indexVertex(v);
    this.splitEdgesThrough(id);
    this.revision++;
    return id;
  }

  private splitEdgesThrough(vid: ID): void {
    const p = this.vertices.get(vid)!.p;
    for (const e of [...this.edges.values()]) {
      if (e.a === vid || e.b === vid) continue;
      const a = this.vertices.get(e.a)!.p;
      const b = this.vertices.get(e.b)!.p;
      const { t, dist } = closestOnSegment(p, a, b);
      if (dist > MERGE_TOL) continue;
      const seg = dist3(a, b);
      if (t * seg < MERGE_TOL || (1 - t) * seg < MERGE_TOL) continue;
      this.edges.delete(e.id);
      this.rawEdge(e.a, vid, e.smooth);
      this.rawEdge(vid, e.b, e.smooth);
    }
  }

  private rawEdge(a: ID, b: ID, smooth?: boolean): ID | null {
    if (a === b) return null;
    for (const e of this.edges.values()) {
      if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return e.id;
    }
    const id = this.nextId++;
    this.edges.set(id, { id, a, b, smooth });
    return id;
  }

  // ------------------------------------------------------------------ arestas

  /**
   * Traça um segmento: funde extremos, corta arestas cruzadas e emenda em
   * vértices que caem no caminho. Devolve as arestas criadas.
   */
  addSegment(p0: Vec3, p1: Vec3, smooth?: boolean): ID[] {
    if (dist3(p0, p1) < MERGE_TOL) return [];
    const va = this.addPoint(p0);
    const vb = this.addPoint(p1);
    const a = this.vertices.get(va)!.p;
    const b = this.vertices.get(vb)!.p;
    const dir = sub3(b, a);
    const segLen = len3(dir);
    const dirN = norm3(dir);

    // 1. quebra em cruzamentos com arestas existentes
    for (const e of [...this.edges.values()]) {
      if (!this.edges.has(e.id)) continue;
      const ea = this.vertices.get(e.a)!.p;
      const eb = this.vertices.get(e.b)!.p;
      const edir = sub3(eb, ea);
      const hit = lineLineClosest(a, dir, ea, edir);
      if (!hit) continue;
      if (hit.dist > MERGE_TOL) continue;
      if (hit.t1 < -1e-6 || hit.t1 > 1 + 1e-6) continue;
      if (hit.t2 < -1e-6 || hit.t2 > 1 + 1e-6) continue;
      this.addPoint(hit.a);
    }

    // 2. coleta todos os vértices sobre o segmento
    const onSeg: { t: number; id: ID }[] = [];
    for (const v of this.vertices.values()) {
      const rel = sub3(v.p, a);
      const t = dot3(rel, dirN);
      if (t < -MERGE_TOL || t > segLen + MERGE_TOL) continue;
      const perp = len3(sub3(rel, mul3(dirN, t)));
      if (perp > MERGE_TOL) continue;
      onSeg.push({ t, id: v.id });
    }
    onSeg.sort((x, y) => x.t - y.t);

    const created: ID[] = [];
    for (let i = 0; i < onSeg.length - 1; i++) {
      if (onSeg[i + 1].t - onSeg[i].t < MERGE_TOL) continue;
      const id = this.rawEdge(onSeg[i].id, onSeg[i + 1].id, smooth);
      if (id !== null) created.push(id);
    }
    this.revision++;
    return created;
  }

  addPolyline(points: Vec3[], close: boolean, smooth?: boolean): ID[] {
    const out: ID[] = [];
    for (let i = 0; i < points.length - 1; i++) out.push(...this.addSegment(points[i], points[i + 1], smooth));
    if (close && points.length > 2) out.push(...this.addSegment(points[points.length - 1], points[0], smooth));
    return out;
  }

  deleteEdge(id: ID): void {
    const e = this.edges.get(id);
    if (!e) return;
    this.edges.delete(id);
    this.pruneOrphan(e.a);
    this.pruneOrphan(e.b);
    this.revision++;
  }

  private pruneOrphan(vid: ID): void {
    for (const e of this.edges.values()) if (e.a === vid || e.b === vid) return;
    this.vertices.delete(vid);
    this.reindexAll();
  }

  deleteFace(key: string): void {
    this.suppressed.add(key);
    this.revision++;
  }

  /** Apaga a face e todas as arestas que só pertencem a ela. */
  deleteFaceAndEdges(face: Face): void {
    const others = this.faces().filter((f) => f.key !== face.key);
    const used = new Set<string>();
    for (const f of others) {
      for (const loop of [f.loop, ...f.holes]) {
        for (let i = 0; i < loop.length; i++) {
          const a = loop[i];
          const b = loop[(i + 1) % loop.length];
          used.add(a < b ? `${a}_${b}` : `${b}_${a}`);
        }
      }
    }
    this.suppressed.add(face.key);
    for (const loop of [face.loop, ...face.holes]) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        if (used.has(key)) continue;
        const edge = [...this.edges.values()].find(
          (e) => (e.a === a && e.b === b) || (e.a === b && e.b === a),
        );
        if (edge) this.deleteEdge(edge.id);
      }
    }
    this.revision++;
  }

  edgeBetween(a: ID, b: ID): Edge | null {
    for (const e of this.edges.values()) {
      if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return e;
    }
    return null;
  }

  edgesOfFace(face: Face): ID[] {
    const out: ID[] = [];
    for (const loop of [face.loop, ...face.holes]) {
      for (let i = 0; i < loop.length; i++) {
        const e = this.edgeBetween(loop[i], loop[(i + 1) % loop.length]);
        if (e) out.push(e.id);
      }
    }
    return out;
  }

  // ---------------------------------------------------------- transformações

  translateVertices(ids: Iterable<ID>, delta: Vec3): void {
    for (const id of ids) {
      const v = this.vertices.get(id);
      if (!v) continue;
      v.p = [q(v.p[0] + delta[0], 6), q(v.p[1] + delta[1], 6), q(v.p[2] + delta[2], 6)];
    }
    this.reindexAll();
    this.revision++;
  }

  setVertexPositions(entries: [ID, Vec3][]): void {
    for (const [id, p] of entries) {
      const v = this.vertices.get(id);
      if (v) v.p = [q(p[0], 6), q(p[1], 6), q(p[2], 6)];
    }
    this.reindexAll();
    this.revision++;
  }

  verticesOf(refs: EntityRef[]): Set<ID> {
    const out = new Set<ID>();
    for (const r of refs) {
      if (r.kind === 'vertex') out.add(r.id);
      else if (r.kind === 'edge') {
        const e = this.edges.get(r.id);
        if (e) {
          out.add(e.a);
          out.add(e.b);
        }
      } else if (r.kind === 'face') {
        const f = this.faces().find((x) => x.key === r.key);
        if (f) for (const loop of [f.loop, ...f.holes]) for (const id of loop) out.add(id);
      }
    }
    return out;
  }

  // ------------------------------------------------- anotações e construção

  /** Posição atual de uma âncora: segue o vértice enquanto ele existir. */
  anchorPoint(a: Anchor): Vec3 {
    if (a.v !== undefined) {
      const v = this.vertices.get(a.v);
      if (v) return v.p;
    }
    return a.p;
  }

  makeAnchor(p: Vec3, vertexId?: ID): Anchor {
    return vertexId !== undefined ? { v: vertexId, p: [...p] as Vec3 } : { p: [...p] as Vec3 };
  }

  addDimension(a: Anchor, b: Anchor, offset: Vec3): ID {
    const id = this.nextId++;
    this.dimensions.set(id, { id, a, b, offset: [...offset] as Vec3 });
    this.revision++;
    return id;
  }

  addNote(anchor: Anchor, offset: Vec3, text: string): ID {
    const id = this.nextId++;
    this.notes.set(id, { id, anchor, offset: [...offset] as Vec3, text });
    this.revision++;
    return id;
  }

  setNoteText(id: ID, text: string): void {
    const n = this.notes.get(id);
    if (!n) return;
    n.text = text;
    this.revision++;
  }

  addGuide(p: Vec3, dir: Vec3 | null): ID {
    const id = this.nextId++;
    this.guides.set(id, { id, p: [...p] as Vec3, dir: dir ? (norm3(dir) as Vec3) : null });
    this.revision++;
    return id;
  }

  clearGuides(): void {
    if (!this.guides.size) return;
    this.guides.clear();
    this.revision++;
  }

  deleteAnnotation(ref: EntityRef): boolean {
    if (ref.kind === 'cota') return this.dimensions.delete(ref.id) && !!++this.revision;
    if (ref.kind === 'texto') return this.notes.delete(ref.id) && !!++this.revision;
    if (ref.kind === 'guia') return this.guides.delete(ref.id) && !!++this.revision;
    return false;
  }

  // ------------------------------------------------------------- push / pull

  /** A face é a tampa de um prisma reto? Nesse caso empurramos em vez de extrudar. */
  canStretch(face: Face): boolean {
    const faces = this.faces();
    const use = new Map<string, number>();
    for (const f of faces) {
      for (const loop of [f.loop, ...f.holes]) {
        for (let i = 0; i < loop.length; i++) {
          const a = loop[i];
          const b = loop[(i + 1) % loop.length];
          const k = a < b ? `${a}_${b}` : `${b}_${a}`;
          use.set(k, (use.get(k) ?? 0) + 1);
        }
      }
    }
    for (const loop of [face.loop, ...face.holes]) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        const k = a < b ? `${a}_${b}` : `${b}_${a}`;
        if ((use.get(k) ?? 0) < 2) return false;
      }
    }
    // cada vértice precisa de uma aresta paralela à normal
    const n = face.normal;
    for (const loop of [face.loop, ...face.holes]) {
      for (const vid of loop) {
        let ok = false;
        for (const e of this.edges.values()) {
          if (e.a !== vid && e.b !== vid) continue;
          const other = e.a === vid ? e.b : e.a;
          if (loop.includes(other)) continue;
          const d = norm3(sub3(this.vertices.get(other)!.p, this.vertices.get(vid)!.p));
          if (Math.abs(dot3(d, n)) > 0.999) {
            ok = true;
            break;
          }
        }
        if (!ok) return false;
      }
    }
    return true;
  }

  /**
   * Extruda uma face por `dist` ao longo da normal. Se a face for a tampa de um
   * prisma reto, apenas desloca os vértices (estica o volume). Se o topo pousar
   * exatamente sobre outra face, vaza — é assim que se faz um vão de janela.
   */
  pushPull(face: Face, dist: number): { mode: 'stretch' | 'extrude'; cut: boolean } {
    if (Math.abs(dist) < MERGE_TOL) return { mode: 'stretch', cut: false };
    const n = face.normal;
    const offset = mul3(n, dist);

    if (this.canStretch(face)) {
      const ids = new Set<ID>();
      for (const loop of [face.loop, ...face.holes]) for (const id of loop) ids.add(id);
      this.translateVertices(ids, offset);
      return { mode: 'stretch', cut: false };
    }

    // detecta travessia: o topo cai dentro de outra face coplanar?
    const capPts = face.loop.map((id) => add3(this.vertices.get(id)!.p, offset));
    const cut = this.findFaceContaining(capPts, face.key) !== null;

    const loops = [face.loop, ...face.holes];
    const newLoops: ID[][] = [];
    for (const loop of loops) {
      const pts = loop.map((id) => add3(this.vertices.get(id)!.p, offset));
      const ids: ID[] = [];
      for (const p of pts) ids.push(this.addPoint(p));
      // paredes laterais + tampa
      for (let i = 0; i < loop.length; i++) {
        const j = (i + 1) % loop.length;
        this.addSegment(this.vertices.get(ids[i])!.p, this.vertices.get(ids[j])!.p);
        this.addSegment(this.vertices.get(loop[i])!.p, this.vertices.get(ids[i])!.p);
      }
      newLoops.push(ids);
    }

    this.revision++;
    if (cut) {
      // A tampa e a face de origem podem ter sido repartidas por arestas que
      // já existiam (o rodapé de uma porta, por exemplo). Por isso apagamos
      // tudo o que couber dentro do contorno, e não uma chave específica.
      this.suppressWithin(face.loop.map((id) => this.vertices.get(id)!.p), face.normal);
      this.suppressWithin(newLoops[0].map((id) => this.vertices.get(id)!.p), face.normal);
    }
    return { mode: 'extrude', cut };
  }

  /** Apaga toda face coplanar contida no contorno dado. */
  private suppressWithin(poly: Vec3[], normal: Vec3): void {
    const origin = poly[0];
    const [u, v] = planeBasis(normal);
    const poly2 = poly.map((p) => projectToPlane(p, origin, u, v));
    const tol = MERGE_TOL * 10;
    let changed = false;
    for (const f of this.faces()) {
      if (Math.abs(Math.abs(dot3(f.normal, normal)) - 1) > 1e-3) continue;
      const pts = [f.loop, ...f.holes].flat().map((id) => this.vertices.get(id)!.p);
      if (pts.some((p) => Math.abs(dot3(normal, sub3(p, origin))) > PLANE_TOL * 4)) continue;
      const inside = pts.every((p) => {
        const p2 = projectToPlane(p, origin, u, v);
        return pointInPolygon2(p2, poly2) || distToPolygon2(p2, poly2) < tol;
      });
      if (!inside) continue;
      this.suppressed.add(f.key);
      changed = true;
    }
    if (changed) this.revision++;
  }

  private findFaceContaining(pts: Vec3[], excludeKey: string): Face | null {
    for (const f of this.faces()) {
      if (f.key === excludeKey) continue;
      const origin = this.vertices.get(f.loop[0])!.p;
      let coplanar = true;
      for (const p of pts) {
        if (Math.abs(dot3(f.normal, sub3(p, origin))) > PLANE_TOL * 4) {
          coplanar = false;
          break;
        }
      }
      if (!coplanar) continue;
      const [u, v] = planeBasis(f.normal);
      const poly = f.loop.map((id) => projectToPlane(this.vertices.get(id)!.p, origin, u, v));
      // Basta o miolo da tampa cair dentro da face de destino. Ser tolerante
      // aqui é o que faz uma porta que encosta no piso vazar a parede.
      const cover = pts.filter((p) => {
        const p2 = projectToPlane(p, origin, u, v);
        return pointInPolygon2(p2, poly) || distToPolygon2(p2, poly) < MERGE_TOL * 10;
      }).length;
      const center = centroid3(pts);
      if (cover * 2 >= pts.length && pointInPolygon2(projectToPlane(center, origin, u, v), poly)) return f;
    }
    return null;
  }

  /** Deslocamento paralelo do contorno de uma face (bissetrizes). */
  offsetLoop(face: Face, dist: number): Vec3[] {
    const pts = this.faceLoopPoints(face);
    const n = face.normal;
    const out: Vec3[] = [];
    const count = pts.length;
    for (let i = 0; i < count; i++) {
      const prev = pts[(i - 1 + count) % count];
      const cur = pts[i];
      const next = pts[(i + 1) % count];
      const d1 = norm3(sub3(cur, prev));
      const d2 = norm3(sub3(next, cur));
      // normais internas de cada aresta (no plano)
      const n1 = norm3(cross3(n, d1));
      const n2 = norm3(cross3(n, d2));
      const bis = norm3(add3(n1, n2));
      const cosHalf = Math.max(0.2, dot3(bis, n1));
      out.push(add3(cur, mul3(bis, dist / cosHalf)));
    }
    return out;
  }

  // ------------------------------------------------------------- serialização

  applyMaterial(faceKeyValue: string, materialId: string | null): void {
    if (materialId) this.faceMaterials.set(faceKeyValue, materialId);
    else this.faceMaterials.delete(faceKeyValue);
    this.revision++;
  }

  toSnapshot(): ModelSnapshot {
    return {
      version: 2,
      vertices: [...this.vertices.values()].map((v) => [v.id, v.p] as [ID, Vec3]),
      edges: [...this.edges.values()].map((e) => [e.id, e.a, e.b, e.smooth ? 1 : 0] as [ID, ID, ID, 0 | 1]),
      suppressed: [...this.suppressed],
      faceMaterials: [...this.faceMaterials.entries()],
      materials: [...this.materials.values()],
      nextId: this.nextId,
      dimensions: [...this.dimensions.values()].map((d) => structuredClone(d)),
      notes: [...this.notes.values()].map((n) => structuredClone(n)),
      guides: [...this.guides.values()].map((g) => structuredClone(g)),
    };
  }

  loadSnapshot(s: ModelSnapshot): void {
    this.vertices.clear();
    this.edges.clear();
    this.suppressed = new Set(s.suppressed);
    this.faceMaterials = new Map(s.faceMaterials);
    this.materials.clear();
    for (const m of s.materials ?? DEFAULT_MATERIALS) this.materials.set(m.id, { ...m });
    for (const [id, p] of s.vertices) this.vertices.set(id, { id, p: [...p] as Vec3 });
    for (const [id, a, b, sm] of s.edges) this.edges.set(id, { id, a, b, smooth: sm === 1 });
    this.dimensions.clear();
    this.notes.clear();
    this.guides.clear();
    for (const d of s.dimensions ?? []) this.dimensions.set(d.id, structuredClone(d));
    for (const n of s.notes ?? []) this.notes.set(n.id, structuredClone(n));
    for (const g of s.guides ?? []) this.guides.set(g.id, structuredClone(g));
    this.nextId = s.nextId ?? 1;
    this.reindexAll();
    this.faceCache = null;
    this.revision++;
  }

  clear(): void {
    this.vertices.clear();
    this.edges.clear();
    this.suppressed.clear();
    this.faceMaterials.clear();
    this.dimensions.clear();
    this.notes.clear();
    this.guides.clear();
    this.vertexGrid.clear();
    this.faceCache = null;
    this.revision++;
  }
}
