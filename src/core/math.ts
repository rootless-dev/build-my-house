/**
 * Núcleo matemático. Tudo trabalha com tuplas [x, y, z] para manter o modelo
 * serializável e independente do three.js. Convenção Z-up (como no SketchUp):
 * X = vermelho, Y = verde, Z = azul (altura).
 */

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export const EPS = 1e-9;
/** Tolerância de fusão de pontos, em metros (0,1 mm). */
export const MERGE_TOL = 1e-4;
/** Tolerância de coplanaridade, em metros. */
export const PLANE_TOL = 1e-4;

export const v3 = (x = 0, y = 0, z = 0): Vec3 => [x, y, z];
export const clone3 = (a: Vec3): Vec3 => [a[0], a[1], a[2]];
export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len3 = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const dist3 = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const norm3 = (a: Vec3): Vec3 => {
  const l = len3(a);
  return l < EPS ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
};
export const neg3 = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const eq3 = (a: Vec3, b: Vec3, tol = MERGE_TOL): boolean => dist3(a, b) <= tol;

/** Arredonda para descartar ruído de ponto flutuante em chaves de hash. */
export const q = (n: number, digits = 5): number => {
  const f = 10 ** digits;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
};

export const AXIS_X: Vec3 = [1, 0, 0];
export const AXIS_Y: Vec3 = [0, 1, 0];
export const AXIS_Z: Vec3 = [0, 0, 1];

/** Base ortonormal (u, v) para um plano de normal `n`. */
export function planeBasis(n: Vec3): [Vec3, Vec3] {
  const a: Vec3 = Math.abs(n[2]) < 0.9 ? AXIS_Z : AXIS_X;
  const u = norm3(cross3(a, n));
  const v = norm3(cross3(n, u));
  return [u, v];
}

export function projectToPlane(p: Vec3, origin: Vec3, u: Vec3, v: Vec3): Vec2 {
  const d = sub3(p, origin);
  return [dot3(d, u), dot3(d, v)];
}

export function unprojectFromPlane(p: Vec2, origin: Vec3, u: Vec3, v: Vec3): Vec3 {
  return add3(origin, add3(mul3(u, p[0]), mul3(v, p[1])));
}

/** Área com sinal (shoelace). Positiva = anti-horária. */
export function signedArea(pts: Vec2[]): number {
  let s = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function pointInPolygon2(pt: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + EPS) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Distância 2D de um ponto ao contorno de um polígono. */
export function distToPolygon2(pt: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const l2 = abx * abx + aby * aby;
    const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, ((pt[0] - a[0]) * abx + (pt[1] - a[1]) * aby) / l2));
    best = Math.min(best, Math.hypot(pt[0] - (a[0] + abx * t), pt[1] - (a[1] + aby * t)));
  }
  return best;
}

/** Distância de um ponto ao segmento [a,b] e o parâmetro t do pé da perpendicular. */
export function closestOnSegment(p: Vec3, a: Vec3, b: Vec3): { point: Vec3; t: number; dist: number } {
  const ab = sub3(b, a);
  const l2 = dot3(ab, ab);
  const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, dot3(sub3(p, a), ab) / l2));
  const point = add3(a, mul3(ab, t));
  return { point, t, dist: dist3(p, point) };
}

/**
 * Ponto mais próximo entre duas retas infinitas. Retorna os parâmetros e a
 * distância — usado pela inferência de eixo e pela interseção de arestas.
 */
export function lineLineClosest(
  p1: Vec3,
  d1: Vec3,
  p2: Vec3,
  d2: Vec3,
): { t1: number; t2: number; dist: number; a: Vec3; b: Vec3 } | null {
  const r = sub3(p1, p2);
  const a = dot3(d1, d1);
  const b = dot3(d1, d2);
  const c = dot3(d2, d2);
  const d = dot3(d1, r);
  const e = dot3(d2, r);
  const den = a * c - b * b;
  if (Math.abs(den) < 1e-12) return null;
  const t1 = (b * e - c * d) / den;
  const t2 = (a * e - b * d) / den;
  const pa = add3(p1, mul3(d1, t1));
  const pb = add3(p2, mul3(d2, t2));
  return { t1, t2, dist: dist3(pa, pb), a: pa, b: pb };
}

/** Interseção raio × plano. Retorna null se paralelo ou atrás da origem. */
export function rayPlane(ro: Vec3, rd: Vec3, po: Vec3, pn: Vec3): Vec3 | null {
  const denom = dot3(rd, pn);
  if (Math.abs(denom) < 1e-9) return null;
  const t = dot3(sub3(po, ro), pn) / denom;
  if (t < 1e-6) return null;
  return add3(ro, mul3(rd, t));
}

/** Normal de um polígono 3D pelo método de Newell (robusto a quase-degenerados). */
export function newellNormal(pts: Vec3[]): Vec3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return norm3([nx, ny, nz]);
}

export function centroid3(pts: Vec3[]): Vec3 {
  const c: Vec3 = [0, 0, 0];
  for (const p of pts) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  const n = Math.max(1, pts.length);
  return [c[0] / n, c[1] / n, c[2] / n];
}

/** Rotação de `p` em torno do eixo (origem, dir) por `ang` radianos. */
export function rotateAround(p: Vec3, origin: Vec3, axis: Vec3, ang: number): Vec3 {
  const k = norm3(axis);
  const v = sub3(p, origin);
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const term1 = mul3(v, c);
  const term2 = mul3(cross3(k, v), s);
  const term3 = mul3(k, dot3(k, v) * (1 - c));
  return add3(origin, add3(add3(term1, term2), term3));
}
