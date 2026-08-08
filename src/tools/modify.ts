import { Tool, handleAxisKey, type PointerInfo, type ToolId } from './base';
import type { Face, ID } from '../core/types';
import {
  add3,
  closestOnSegment,
  cross3,
  dist3,
  dot3,
  lineLineClosest,
  mul3,
  norm3,
  planeBasis,
  pointInPolygon2,
  projectToPlane,
  rotateAround,
  sub3,
  type Vec3,
} from '../core/math';
import { formatAngle, formatLength, parseAngle, parseFactor, parseLength } from '../core/units';

/** Push/Pull: gives a face volume. Click, move, click again. */
export class PushPullTool extends Tool {
  readonly id: ToolId = 'pushpull';
  private face: Face | null = null;
  private active = false;
  private dist = 0;
  private startScreen = { x: 0, y: 0 };
  private lastDist = 0;

  hint(): string {
    return this.active
      ? 'Mova para dar volume e clique para confirmar, ou digite a distância.'
      : 'Clique numa face e arraste na direção da normal.';
  }

  pointerDown(p: PointerInfo): void {
    if (this.active) {
      this.apply();
      return;
    }
    if (!p.snap.face) {
      this.host.toast('Aponte para uma face para empurrar.');
      return;
    }
    this.face = p.snap.face;
    this.active = true;
    this.dist = 0;
    this.startScreen = { x: p.x, y: p.y };
    this.host.status(this.hint());
  }

  pointerMove(p: PointerInfo): void {
    if (!this.active) {
      this.host.overlay.clear();
      if (p.snap.face) this.host.overlay.polyline(this.host.model.faceLoopPoints(p.snap.face), true);
      this.host.measure('', 'distância');
      this.host.requestRender();
      return;
    }
    const face = this.face!;
    const ro: Vec3 = [p.raycaster.ray.origin.x, p.raycaster.ray.origin.y, p.raycaster.ray.origin.z];
    const rd: Vec3 = [p.raycaster.ray.direction.x, p.raycaster.ray.direction.y, p.raycaster.ray.direction.z];
    const hit = lineLineClosest(face.center, face.normal, ro, rd);
    if (hit) this.dist = hit.t1;
    this.host.overlay.clear();
    this.host.overlay.ghostPrism(this.host.model.faceLoopPoints(face), face.normal, this.dist);
    this.host.measure(formatLength(this.dist, this.host.unit), 'distância');
    this.host.requestRender();
  }

  pointerUp(p: PointerInfo): void {
    if (!this.active) return;
    const moved = Math.hypot(p.x - this.startScreen.x, p.y - this.startScreen.y) > 5;
    if (moved) this.apply();
  }

  doubleClick(p: PointerInfo): void {
    if (p.snap.face && Math.abs(this.lastDist) > 1e-4) {
      this.face = p.snap.face;
      this.dist = this.lastDist;
      this.apply();
    }
  }

  value(text: string): boolean {
    if (!this.active || !this.face) return false;
    const d = parseLength(text, this.host.unit);
    if (d === null) return false;
    // A typed sign wins; without one, the direction the mouse indicated holds.
    const negative = d < 0 || (d >= 0 && this.dist < 0);
    this.dist = negative ? -Math.abs(d) : Math.abs(d);
    this.apply();
    return true;
  }

  private apply(): void {
    // The face has to still exist: an undo or a new project mid-operation would
    // leave a dead reference behind.
    const target = this.face && this.host.model.faces().find((f) => f.key === this.face!.key);
    if (!target || Math.abs(this.dist) < 1e-4) {
      this.cancel();
      return;
    }
    const result = this.host.model.pushPull(target, this.dist);
    this.lastDist = this.dist;
    this.host.refreshModel();
    this.host.commit('Empurrar/Puxar');
    if (result.cut) this.host.toast('Vão aberto: a extrusão atravessou o volume.');
    this.face = null;
    this.active = false;
    this.dist = 0;
    this.reset();
    this.host.status(this.hint());
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.cancel();
      return true;
    }
    return false;
  }

  cancel(): void {
    this.face = null;
    this.active = false;
    this.dist = 0;
    this.reset();
    this.host.status(this.hint());
  }
}

/** Base class for transforms that move existing vertices. */
abstract class TransformTool extends Tool {
  protected ids: ID[] = [];
  protected original: [ID, Vec3][] = [];
  protected active = false;

  protected capture(p: PointerInfo): boolean {
    let refs = this.host.getSelection();
    if (!refs.length && p.snap.entity) {
      refs = [p.snap.entity];
      this.host.setSelection(refs);
    }
    if (!refs.length) {
      this.host.toast('Selecione algo antes, ou clique direto sobre uma face ou aresta.');
      return false;
    }
    this.ids = [...this.host.model.verticesOf(refs)];
    this.original = this.ids.map((id) => [id, [...this.host.model.vertexPos(id)] as Vec3]);
    return this.ids.length > 0;
  }

  protected restore(): void {
    if (this.original.length) {
      this.host.model.setVertexPositions(this.original);
      this.host.refreshModel();
    }
  }

  protected clearState(): void {
    this.ids = [];
    this.original = [];
    this.active = false;
  }
}

/** Move: grabs a reference point and carries the selection along. */
export class MoveTool extends Tool {
  readonly id: ToolId = 'move';
  private origin: Vec3 | null = null;
  private ids: ID[] = [];
  private original: [ID, Vec3][] = [];
  private delta: Vec3 = [0, 0, 0];
  private startScreen = { x: 0, y: 0 };

  hint(): string {
    return this.origin
      ? 'Mova e clique para soltar, ou digite a distância. Setas travam nos eixos.'
      : 'Clique num ponto de referência da seleção para começar a mover.';
  }

  pointerDown(p: PointerInfo): void {
    if (this.origin) {
      this.finish();
      return;
    }
    let refs = this.host.getSelection();
    if (!refs.length && p.snap.entity) {
      refs = [p.snap.entity];
      this.host.setSelection(refs);
    }
    if (!refs.length) {
      this.host.toast('Selecione o que mover, ou clique sobre uma face ou aresta.');
      return;
    }
    this.ids = [...this.host.model.verticesOf(refs)];
    this.original = this.ids.map((id) => [id, [...this.host.model.vertexPos(id)] as Vec3]);
    this.origin = p.snap.point;
    this.startScreen = { x: p.x, y: p.y };
    this.host.inference.base = this.origin;
    this.host.status(this.hint());
  }

  pointerMove(p: PointerInfo): void {
    if (!this.origin) {
      this.host.measure('', 'distância');
      return;
    }
    this.delta = sub3(p.snap.point, this.origin);
    this.apply(this.delta);
    this.host.overlay.clear();
    this.host.overlay.polyline([this.origin, p.snap.point]);
    if (p.snap.axis && p.snap.guideFrom) this.host.overlay.guide(p.snap.guideFrom, p.snap.point, p.snap.axis);
    this.host.measure(formatLength(dist3([0, 0, 0], this.delta), this.host.unit), 'distância');
    this.host.requestRender();
  }

  pointerUp(p: PointerInfo): void {
    if (!this.origin) return;
    if (Math.hypot(p.x - this.startScreen.x, p.y - this.startScreen.y) > 5) this.finish();
  }

  private apply(delta: Vec3): void {
    this.host.model.setVertexPositions(this.original.map(([id, p]) => [id, add3(p, delta)] as [ID, Vec3]));
    this.host.refreshModel();
  }

  value(text: string): boolean {
    if (!this.origin) return false;
    const len = parseLength(text, this.host.unit);
    if (len === null) return false;
    const dir = norm3(this.delta);
    if (!dir[0] && !dir[1] && !dir[2]) return false;
    this.apply(mul3(dir, len));
    this.finish();
    return true;
  }

  private finish(): void {
    this.host.commit('Mover');
    this.origin = null;
    this.ids = [];
    this.original = [];
    this.reset();
    this.host.status(this.hint());
  }

  key(e: KeyboardEvent): boolean {
    if (handleAxisKey(this.host, e)) return true;
    if (e.key === 'Escape') {
      this.cancel();
      return true;
    }
    return false;
  }

  cancel(): void {
    if (this.original.length) {
      this.host.model.setVertexPositions(this.original);
      this.host.refreshModel();
    }
    this.origin = null;
    this.ids = [];
    this.original = [];
    this.reset();
    this.host.status(this.hint());
  }
}

/** Rotate: centre, reference, angle. The axis comes from the plane clicked on. */
export class RotateTool extends TransformTool {
  readonly id: ToolId = 'rotate';
  private center: Vec3 | null = null;
  private axis: Vec3 = [0, 0, 1];
  private refDir: Vec3 | null = null;
  private angle = 0;

  hint(): string {
    if (!this.center) return 'Clique no centro de rotação.';
    if (!this.refDir) return 'Clique para fixar a referência do ângulo.';
    return 'Mova para girar e clique, ou digite o ângulo em graus.';
  }

  pointerDown(p: PointerInfo): void {
    if (!this.center) {
      if (!this.capture(p)) return;
      this.center = p.snap.point;
      this.axis = p.snap.face?.normal ?? [0, 0, 1];
      this.active = true;
      this.host.inference.base = this.center;
      this.host.status(this.hint());
      return;
    }
    if (!this.refDir) {
      const d = sub3(p.snap.point, this.center);
      if (dist3([0, 0, 0], d) < 1e-4) return;
      this.refDir = norm3(d);
      this.host.status(this.hint());
      return;
    }
    this.finish();
  }

  pointerMove(p: PointerInfo): void {
    if (!this.center) {
      this.host.measure('', 'ângulo');
      return;
    }
    this.host.overlay.clear();
    if (!this.refDir) {
      this.host.overlay.guide(this.center, p.snap.point, 'neutral');
      this.host.measure('', 'ângulo');
      this.host.requestRender();
      return;
    }
    const cur = sub3(p.snap.point, this.center);
    const proj = norm3(sub3(cur, mul3(this.axis, dot3(cur, this.axis))));
    if (!proj[0] && !proj[1] && !proj[2]) return;
    const cosA = Math.max(-1, Math.min(1, dot3(this.refDir, proj)));
    const sign = Math.sign(dot3(cross3(this.refDir, proj), this.axis)) || 1;
    this.angle = Math.acos(cosA) * sign;
    this.applyAngle(this.angle);
    this.host.overlay.guide(this.center, add3(this.center, mul3(this.refDir, 2)), 'neutral');
    this.host.overlay.guide(this.center, p.snap.point, 'neutral');
    this.host.measure(formatAngle(this.angle), 'ângulo');
    this.host.requestRender();
  }

  private applyAngle(angle: number): void {
    const entries = this.original.map(
      ([id, p]) => [id, rotateAround(p, this.center!, this.axis, angle)] as [ID, Vec3],
    );
    this.host.model.setVertexPositions(entries);
    this.host.refreshModel();
  }

  value(text: string): boolean {
    if (!this.center || !this.refDir) return false;
    const a = parseAngle(text);
    if (a === null) return false;
    this.applyAngle(a);
    this.finish();
    return true;
  }

  private finish(): void {
    this.host.commit('Girar');
    this.center = null;
    this.refDir = null;
    this.angle = 0;
    this.clearState();
    this.reset();
    this.host.status(this.hint());
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.cancel();
      return true;
    }
    return false;
  }

  cancel(): void {
    this.restore();
    this.center = null;
    this.refDir = null;
    this.clearState();
    this.reset();
    this.host.status(this.hint());
  }
}

/** Offset: copies a face outline inwards or outwards. */
export class OffsetTool extends Tool {
  readonly id: ToolId = 'offset';
  private face: Face | null = null;
  private dist = 0;
  private startScreen = { x: 0, y: 0 };

  hint(): string {
    return this.face
      ? 'Mova para dentro ou para fora e clique, ou digite a distância.'
      : 'Clique numa face para deslocar o contorno dela.';
  }

  pointerDown(p: PointerInfo): void {
    if (this.face) {
      this.apply();
      return;
    }
    if (!p.snap.face) {
      this.host.toast('Aponte para uma face.');
      return;
    }
    this.face = p.snap.face;
    this.startScreen = { x: p.x, y: p.y };
    this.host.status(this.hint());
  }

  pointerMove(p: PointerInfo): void {
    if (!this.face) {
      this.host.overlay.clear();
      if (p.snap.face) this.host.overlay.polyline(this.host.model.faceLoopPoints(p.snap.face), true);
      this.host.measure('', 'distância');
      this.host.requestRender();
      return;
    }
    const face = this.face;
    const pts = this.host.model.faceLoopPoints(face);
    const origin = pts[0];
    const [u, v] = planeBasis(face.normal);
    const poly = pts.map((q) => projectToPlane(q, origin, u, v));
    const probe = projectToPlane(p.snap.point, origin, u, v);
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const seg = closestOnSegment(p.snap.point, pts[i], pts[(i + 1) % pts.length]);
      best = Math.min(best, seg.dist);
    }
    this.dist = pointInPolygon2(probe, poly) ? best : -best;
    this.host.overlay.clear();
    this.host.overlay.polyline(this.host.model.offsetLoop(face, this.dist), true);
    this.host.measure(formatLength(Math.abs(this.dist), this.host.unit), 'distância');
    this.host.requestRender();
  }

  pointerUp(p: PointerInfo): void {
    if (!this.face) return;
    if (Math.hypot(p.x - this.startScreen.x, p.y - this.startScreen.y) > 5) this.apply();
  }

  value(text: string): boolean {
    if (!this.face) return false;
    const d = parseLength(text, this.host.unit);
    if (d === null) return false;
    // A typed sign wins; without one, the direction the mouse indicated holds.
    const negative = d < 0 || (d >= 0 && this.dist < 0);
    this.dist = negative ? -Math.abs(d) : Math.abs(d);
    this.apply();
    return true;
  }

  private apply(): void {
    const target = this.face && this.host.model.faces().find((f) => f.key === this.face!.key);
    if (!target || Math.abs(this.dist) < 1e-4) {
      this.cancel();
      return;
    }
    this.host.model.addPolyline(this.host.model.offsetLoop(target, this.dist), true);
    this.host.refreshModel();
    this.host.commit('Deslocar');
    this.face = null;
    this.dist = 0;
    this.reset();
    this.host.status(this.hint());
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.cancel();
      return true;
    }
    return false;
  }

  cancel(): void {
    this.face = null;
    this.dist = 0;
    this.reset();
    this.host.status(this.hint());
  }
}

/** Scale: grows or shrinks the selection around its own centre. */
export class ScaleTool extends TransformTool {
  readonly id: ToolId = 'scale';
  private center: Vec3 | null = null;
  private base = 0;
  private factor = 1;

  hint(): string {
    return this.center
      ? 'Mova para redimensionar e clique, ou digite o fator (2, 0,5, 150%).'
      : 'Selecione algo, depois clique num ponto de referência para escalar.';
  }

  pointerDown(p: PointerInfo): void {
    if (this.center) {
      this.finish();
      return;
    }
    if (!this.capture(p)) return;
    const pts = this.original.map(([, q]) => q);
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const q of pts) {
      for (let i = 0; i < 3; i++) {
        if (q[i] < min[i]) min[i] = q[i];
        if (q[i] > max[i]) max[i] = q[i];
      }
    }
    const c: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const d = dist3(p.snap.point, c);
    if (d < 1e-3) {
      this.host.toast('Escolha um ponto de referência longe do centro da seleção.');
      this.clearState();
      return;
    }
    this.center = c;
    this.base = d;
    this.active = true;
    this.host.inference.base = c;
    this.host.status(this.hint());
  }

  pointerMove(p: PointerInfo): void {
    if (!this.center) {
      this.host.measure('', 'fator');
      return;
    }
    this.factor = dist3(p.snap.point, this.center) / this.base;
    this.applyFactor(this.factor);
    this.host.overlay.clear();
    this.host.overlay.guide(this.center, p.snap.point, 'neutral');
    this.host.measure(`${this.factor.toFixed(3).replace('.', ',')}×`, 'fator');
    this.host.requestRender();
  }

  private applyFactor(factor: number): void {
    const c = this.center!;
    const entries = this.original.map(
      ([id, q]) => [id, add3(c, mul3(sub3(q, c), factor))] as [ID, Vec3],
    );
    this.host.model.setVertexPositions(entries);
    this.host.refreshModel();
  }

  value(text: string): boolean {
    if (!this.center) return false;
    const f = parseFactor(text);
    if (f === null) return false;
    this.applyFactor(f);
    this.finish();
    return true;
  }

  private finish(): void {
    this.host.commit('Escala');
    this.center = null;
    this.clearState();
    this.reset();
    this.host.status(this.hint());
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.cancel();
      return true;
    }
    return false;
  }

  cancel(): void {
    this.restore();
    this.center = null;
    this.clearState();
    this.reset();
    this.host.status(this.hint());
  }
}
