import { Tool, handleAxisKey, type PointerInfo, type ToolHost, type ToolId } from './base';
import {
  AXIS_X,
  AXIS_Z,
  add3,
  cross3,
  dist3,
  dot3,
  mul3,
  norm3,
  sub3,
  type Vec3,
} from '../core/math';
import { formatLength, parseLength, parsePair } from '../core/units';

/** Current work plane: origin plus an axis-aligned orthonormal basis. */
function workPlane(origin: Vec3, normal: Vec3): { o: Vec3; n: Vec3; u: Vec3; v: Vec3 } {
  const n = norm3(normal);
  let u: Vec3;
  if (Math.abs(dot3(n, AXIS_Z)) > 0.9) u = AXIS_X;
  else u = norm3(cross3(AXIS_Z, n));
  const v = norm3(cross3(n, u));
  return { o: origin, n, u, v };
}

function onPlane(p: Vec3, plane: { o: Vec3; n: Vec3 }): Vec3 {
  const d = dot3(sub3(p, plane.o), plane.n);
  return sub3(p, mul3(plane.n, d));
}

export class LineTool extends Tool {
  readonly id: ToolId = 'line';
  private points: Vec3[] = [];
  private lastDir: Vec3 | null = null;

  hint(): string {
    return this.points.length
      ? 'Clique no próximo ponto, ou digite o comprimento. Enter fecha; Esc encerra a linha.'
      : 'Clique para começar a linha. As setas travam nos eixos.';
  }

  pointerDown(p: PointerInfo): void {
    const point = p.snap.point;
    if (!this.points.length) {
      this.points = [point];
      this.host.inference.base = point;
      if (p.snap.face) this.host.inference.plane = { origin: point, normal: p.snap.face.normal };
      this.host.status(this.hint());
      return;
    }
    const last = this.points[this.points.length - 1];
    if (dist3(last, point) < 1e-4) return;
    this.host.model.addSegment(last, point);
    this.points.push(point);
    this.host.refreshModel();
    this.host.commit('Linha');
    const closed = this.points.length > 2 && dist3(point, this.points[0]) < 1e-4;
    if (closed) {
      this.points = [];
      this.host.inference.reset();
      this.reset();
    } else {
      this.host.inference.base = point;
      this.host.inference.lockAxis = null;
    }
    this.host.status(this.hint());
  }

  pointerMove(p: PointerInfo): void {
    if (!this.points.length) {
      this.host.measure('', 'comprimento');
      return;
    }
    const last = this.points[this.points.length - 1];
    const to = p.snap.point;
    this.lastDir = norm3(sub3(to, last));
    this.host.overlay.clear();
    this.host.overlay.polyline([last, to]);
    if (p.snap.axis && p.snap.guideFrom) this.host.overlay.guide(p.snap.guideFrom, to, p.snap.axis);
    this.host.measure(formatLength(dist3(last, to), this.host.unit), 'comprimento');
    this.host.requestRender();
  }

  doubleClick(): void {
    this.finish();
  }

  key(e: KeyboardEvent): boolean {
    if (handleAxisKey(this.host, e)) return true;
    if (e.key === 'Escape') {
      this.finish();
      return true;
    }
    return false;
  }

  value(text: string): boolean {
    if (!this.points.length || !this.lastDir) return false;
    const len = parseLength(text, this.host.unit);
    if (len === null) return false;
    const last = this.points[this.points.length - 1];
    const target = add3(last, mul3(this.lastDir, len));
    this.host.model.addSegment(last, target);
    this.points.push(target);
    this.host.refreshModel();
    this.host.commit('Linha');
    this.host.inference.base = target;
    this.host.overlay.clear();
    this.host.requestRender();
    return true;
  }

  private finish(): void {
    this.points = [];
    this.lastDir = null;
    this.reset();
    this.host.status(this.hint());
  }

  cancel(): void {
    this.finish();
  }
}

export class RectangleTool extends Tool {
  readonly id: ToolId = 'rectangle';
  private start: Vec3 | null = null;
  private plane = workPlane([0, 0, 0], AXIS_Z);
  private corners: Vec3[] = [];

  hint(): string {
    return this.start
      ? 'Clique no canto oposto, ou digite “largura ; profundidade”.'
      : 'Clique no primeiro canto do retângulo.';
  }

  pointerDown(p: PointerInfo): void {
    if (!this.start) {
      this.start = p.snap.point;
      this.plane = workPlane(this.start, p.snap.face?.normal ?? AXIS_Z);
      this.host.inference.base = this.start;
      this.host.inference.plane = { origin: this.start, normal: this.plane.n };
      this.host.status(this.hint());
      return;
    }
    if (this.corners.length === 4) this.commitRect(this.corners);
  }

  pointerMove(p: PointerInfo): void {
    if (!this.start) {
      this.host.measure('', 'largura ; profundidade');
      return;
    }
    const end = onPlane(p.snap.point, this.plane);
    this.corners = this.rectFrom(this.start, end);
    const w = dot3(sub3(end, this.start), this.plane.u);
    const h = dot3(sub3(end, this.start), this.plane.v);
    this.host.overlay.clear();
    this.host.overlay.polyline(this.corners, true);
    this.host.measure(
      `${formatLength(Math.abs(w), this.host.unit)} ; ${formatLength(Math.abs(h), this.host.unit)}`,
      'largura ; profundidade',
    );
    this.host.requestRender();
  }

  private rectFrom(a: Vec3, b: Vec3): Vec3[] {
    const du = dot3(sub3(b, a), this.plane.u);
    const dv = dot3(sub3(b, a), this.plane.v);
    return [
      a,
      add3(a, mul3(this.plane.u, du)),
      add3(add3(a, mul3(this.plane.u, du)), mul3(this.plane.v, dv)),
      add3(a, mul3(this.plane.v, dv)),
    ];
  }

  private commitRect(pts: Vec3[]): void {
    this.host.model.addPolyline(pts, true);
    this.host.refreshModel();
    this.host.commit('Retângulo');
    this.start = null;
    this.corners = [];
    this.reset();
    this.host.status(this.hint());
  }

  value(text: string): boolean {
    if (!this.start) return false;
    const pair = parsePair(text, this.host.unit);
    if (!pair) return false;
    const [w, h] = pair;
    const su = this.corners.length ? Math.sign(dot3(sub3(this.corners[1], this.start), this.plane.u)) || 1 : 1;
    const sv = this.corners.length ? Math.sign(dot3(sub3(this.corners[3], this.start), this.plane.v)) || 1 : 1;
    const a = this.start;
    const pts = [
      a,
      add3(a, mul3(this.plane.u, w * su)),
      add3(add3(a, mul3(this.plane.u, w * su)), mul3(this.plane.v, h * sv)),
      add3(a, mul3(this.plane.v, h * sv)),
    ];
    this.commitRect(pts);
    return true;
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.cancel();
      return true;
    }
    return false;
  }

  cancel(): void {
    this.start = null;
    this.corners = [];
    this.reset();
    this.host.status(this.hint());
  }
}

class CircularTool extends Tool {
  readonly id: ToolId;
  protected center: Vec3 | null = null;
  protected plane = workPlane([0, 0, 0], AXIS_Z);
  protected radius = 0;
  protected sides: number;
  private label: string;

  constructor(host: ToolHost, id: ToolId, sides: number, label: string) {
    super(host);
    this.id = id;
    this.sides = sides;
    this.label = label;
  }

  hint(): string {
    return this.center
      ? `Arraste para definir o raio, ou digite o valor. (${this.segments()} lados)`
      : `Clique no centro d${this.label === 'Círculo' ? 'o círculo' : 'o polígono'}.`;
  }

  protected segments(): number {
    return this.id === 'polygon' ? this.host.polygonSides : this.sides;
  }

  pointerDown(p: PointerInfo): void {
    if (!this.center) {
      this.center = p.snap.point;
      this.plane = workPlane(this.center, p.snap.face?.normal ?? AXIS_Z);
      this.host.inference.base = this.center;
      this.host.inference.plane = { origin: this.center, normal: this.plane.n };
      this.host.status(this.hint());
      return;
    }
    if (this.radius > 1e-4) this.build(this.radius);
  }

  pointerMove(p: PointerInfo): void {
    if (!this.center) {
      this.host.measure('', 'raio');
      return;
    }
    const point = onPlane(p.snap.point, this.plane);
    this.radius = dist3(point, this.center);
    this.host.overlay.clear();
    this.host.overlay.polyline(this.ring(this.radius), true);
    this.host.overlay.guide(this.center, point, 'neutral');
    this.host.measure(formatLength(this.radius, this.host.unit), 'raio');
    this.host.requestRender();
  }

  protected ring(radius: number): Vec3[] {
    const n = this.segments();
    const pts: Vec3[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(
        add3(this.center!, add3(mul3(this.plane.u, Math.cos(a) * radius), mul3(this.plane.v, Math.sin(a) * radius))),
      );
    }
    return pts;
  }

  private build(radius: number): void {
    this.host.model.addPolyline(this.ring(radius), true, this.id === 'circle');
    this.host.refreshModel();
    this.host.commit(this.label);
    this.center = null;
    this.radius = 0;
    this.reset();
    this.host.status(this.hint());
  }

  value(text: string): boolean {
    if (!this.center) return false;
    const r = parseLength(text, this.host.unit);
    if (r === null || r <= 0) return false;
    this.build(r);
    return true;
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.cancel();
      return true;
    }
    return false;
  }

  cancel(): void {
    this.center = null;
    this.radius = 0;
    this.reset();
    this.host.status(this.hint());
  }
}

export class CircleTool extends CircularTool {
  constructor(host: ToolHost) {
    super(host, 'circle', 32, 'Círculo');
  }
}

export class PolygonTool extends CircularTool {
  constructor(host: ToolHost) {
    super(host, 'polygon', 6, 'Polígono');
  }
}

/**
 * Arc by chord and sagitta: two clicks set the chord, the third pulls the
 * curvature. It comes out as a run of smoothed segments, the same way SketchUp
 * treats an arc.
 */
export class ArcTool extends Tool {
  readonly id: ToolId = 'arc';
  private a: Vec3 | null = null;
  private b: Vec3 | null = null;
  private plane = workPlane([0, 0, 0], AXIS_Z);
  private arcPts: Vec3[] = [];
  private sagitta = 0;

  hint(): string {
    if (!this.a) return 'Clique no início da corda do arco.';
    if (!this.b) return 'Clique no fim da corda.';
    return 'Puxe a curvatura e clique, ou digite a flecha.';
  }

  pointerDown(p: PointerInfo): void {
    if (!this.a) {
      this.a = p.snap.point;
      this.plane = workPlane(this.a, p.snap.face?.normal ?? AXIS_Z);
      this.host.inference.base = this.a;
      this.host.inference.plane = { origin: this.a, normal: this.plane.n };
      this.host.status(this.hint());
      return;
    }
    if (!this.b) {
      const end = onPlane(p.snap.point, this.plane);
      if (dist3(end, this.a) < 1e-4) return;
      this.b = end;
      this.host.inference.base = this.b;
      this.host.status(this.hint());
      return;
    }
    this.build();
  }

  pointerMove(p: PointerInfo): void {
    if (!this.a) {
      this.host.measure('', 'corda');
      return;
    }
    this.host.overlay.clear();
    if (!this.b) {
      const end = onPlane(p.snap.point, this.plane);
      this.host.overlay.polyline([this.a, end]);
      if (p.snap.axis && p.snap.guideFrom) this.host.overlay.guide(p.snap.guideFrom, end, p.snap.axis);
      this.host.measure(formatLength(dist3(this.a, end), this.host.unit), 'corda');
      this.host.requestRender();
      return;
    }
    const cursor = onPlane(p.snap.point, this.plane);
    const mid = mul3(add3(this.a, this.b), 0.5);
    const chord = norm3(sub3(this.b, this.a));
    const outward = norm3(cross3(this.plane.n, chord));
    this.sagitta = dot3(sub3(cursor, mid), outward);
    this.arcPts = this.arcPoints(this.sagitta);
    this.host.overlay.polyline(this.arcPts);
    this.host.overlay.guide(this.a, this.b, 'neutral');
    this.host.measure(formatLength(Math.abs(this.sagitta), this.host.unit), 'flecha');
    this.host.requestRender();
  }

  /** Points of the arc through A and B with sagitta `s` measured at the chord midpoint. */
  private arcPoints(s: number): Vec3[] {
    const a = this.a!;
    const b = this.b!;
    const mid = mul3(add3(a, b), 0.5);
    const chord = norm3(sub3(b, a));
    const outward = norm3(cross3(this.plane.n, chord));
    const half = dist3(a, b) / 2;
    if (Math.abs(s) < 1e-4 || half < 1e-6) return [a, b];
    const radius = (half * half + s * s) / (2 * Math.abs(s));
    const sign = Math.sign(s);
    const center = add3(mid, mul3(outward, sign * (Math.abs(s) - radius)));
    const segments = Math.max(6, Math.min(48, this.host.polygonSides * 2));
    const apex = add3(mid, mul3(outward, s));
    const ang = (p: Vec3) => {
      const rel = sub3(p, center);
      return Math.atan2(dot3(rel, outward), dot3(rel, chord));
    };
    // Pick the sweep direction that passes through the apex — that is what
    // decides whether the arc is the short or the long piece of the circle.
    const a0 = ang(a);
    const tau = Math.PI * 2;
    const ccw = (x: number) => (((x - a0) % tau) + tau) % tau;
    const toB = ccw(ang(b));
    const end = ccw(ang(apex)) <= toB ? a0 + toB : a0 - (tau - toB);
    const out: Vec3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = a0 + (end - a0) * (i / segments);
      out.push(add3(center, add3(mul3(chord, Math.cos(t) * radius), mul3(outward, Math.sin(t) * radius))));
    }
    return out;
  }

  private build(): void {
    if (this.arcPts.length < 2) {
      this.cancel();
      return;
    }
    this.host.model.addPolyline(this.arcPts, false, true);
    this.host.refreshModel();
    this.host.commit('Arco');
    this.cancel();
  }

  value(text: string): boolean {
    if (!this.a || !this.b) return false;
    const s = parseLength(text, this.host.unit);
    if (s === null || Math.abs(s) < 1e-5) return false;
    this.arcPts = this.arcPoints(this.sagitta < 0 ? -Math.abs(s) : Math.abs(s));
    this.build();
    return true;
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.cancel();
      return true;
    }
    return false;
  }

  cancel(): void {
    this.a = null;
    this.b = null;
    this.arcPts = [];
    this.sagitta = 0;
    this.reset();
    this.host.status(this.hint());
  }
}

export { workPlane, onPlane };
