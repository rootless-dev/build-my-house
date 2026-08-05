import * as THREE from 'three';
import { Tool, handleAxisKey, type PointerInfo, type ToolId } from './base';
import type { Anchor } from '../core/types';
import {
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  add3,
  dist3,
  dot3,
  len3,
  mul3,
  norm3,
  sub3,
  type Vec3,
} from '../core/math';
import { formatArea, formatLength, parseLength } from '../core/units';
import type { Snap } from '../viewer/Inference';

/** Âncora a partir do que a inferência capturou — gruda no vértice quando há um. */
function anchorFrom(snap: Snap): { p: Vec3; v?: number } {
  return snap.entity?.kind === 'vertex' ? { p: snap.point, v: snap.entity.id } : { p: snap.point };
}

/**
 * O deslocamento da cota corre num plano que contém o segmento medido e fica
 * o mais de frente possível para a câmera — assim arrastar sempre responde.
 */
function offsetPlaneNormal(from: Vec3, to: Vec3, viewDir: Vec3): Vec3 {
  const d = norm3(sub3(to, from));
  const n = sub3(viewDir, mul3(d, dot3(viewDir, d)));
  return len3(n) < 1e-6 ? norm3([d[1], -d[0], d[2]]) : norm3(n);
}

/**
 * O afastamento da cota sempre assenta num eixo. Cota torta é ruído numa
 * prancha: das direções perpendiculares ao segmento, escolhemos a que o cursor
 * mais persegue, e o tamanho é o quanto ele andou nela.
 */
function axisOffset(relative: Vec3, along: Vec3): Vec3 {
  const perp = sub3(relative, mul3(along, dot3(relative, along)));
  if (len3(perp) < 1e-4) return [0, 0, 0];
  let best: Vec3 = [0, 0, 0];
  let bestReach = 0;
  for (const axis of [AXIS_X, AXIS_Y, AXIS_Z]) {
    const candidate = sub3(axis, mul3(along, dot3(axis, along)));
    if (len3(candidate) < 1e-3) continue;
    const dir = norm3(candidate);
    const reach = dot3(perp, dir);
    if (Math.abs(reach) > Math.abs(bestReach)) {
      bestReach = reach;
      best = dir;
    }
  }
  return mul3(best, bestReach);
}

/** Cota: marca a medida no modelo, presa aos pontos escolhidos. */
export class CotarTool extends Tool {
  readonly id: ToolId = 'cotar';
  private a: Anchor | null = null;
  private b: Anchor | null = null;
  private offset: Vec3 = [0, 0, 0];
  private forward = new THREE.Vector3();

  hint(): string {
    if (!this.a) return 'Clique no primeiro ponto, ou direto numa aresta para cotá-la inteira.';
    if (!this.b) return 'Clique no segundo ponto da medida.';
    return 'Afaste a linha de cota e clique para fixar. As setas travam o lado; Esc cancela.';
  }

  pointerDown(p: PointerInfo): void {
    const model = this.host.model;
    if (!this.a) {
      // clicar sobre uma aresta cota a aresta inteira de uma vez
      if (p.snap.entity?.kind === 'edge' && p.snap.type === 'aresta') {
        const edge = model.edges.get(p.snap.entity.id);
        if (edge) {
          this.a = model.makeAnchor(model.vertexPos(edge.a), edge.a);
          this.b = model.makeAnchor(model.vertexPos(edge.b), edge.b);
          this.host.inference.base = this.a.p;
          this.host.status(this.hint());
          return;
        }
      }
      const anchor = anchorFrom(p.snap);
      this.a = model.makeAnchor(anchor.p, anchor.v);
      this.host.inference.base = this.a.p;
      this.host.status(this.hint());
      return;
    }
    if (!this.b) {
      const anchor = anchorFrom(p.snap);
      if (dist3(anchor.p, this.a.p) < 1e-4) return;
      this.b = model.makeAnchor(anchor.p, anchor.v);
      // A origem segue sendo o primeiro ponto: assim as setas travam o
      // afastamento num eixo, do mesmo jeito que nas outras ferramentas.
      this.host.inference.base = this.a.p;
      this.host.status(this.hint());
      return;
    }
    this.place();
  }

  pointerMove(p: PointerInfo): void {
    const model = this.host.model;
    this.host.overlay.clear();
    if (!this.a) {
      if (p.snap.entity?.kind === 'edge' && p.snap.type === 'aresta') {
        const [ea, eb] = model.edgePoints(p.snap.entity.id);
        this.host.overlay.polyline([ea, eb]);
        this.host.measure(formatLength(dist3(ea, eb), this.host.unit), 'aresta inteira');
      } else {
        this.host.measure('', 'medida');
      }
      this.host.requestRender();
      return;
    }
    if (!this.b) {
      this.host.overlay.polyline([this.a.p, p.snap.point]);
      if (p.snap.axis && p.snap.guideFrom) this.host.overlay.guide(p.snap.guideFrom, p.snap.point, p.snap.axis);
      this.host.measure(formatLength(dist3(this.a.p, p.snap.point), this.host.unit), 'medida');
      this.host.requestRender();
      return;
    }

    const a = model.anchorPoint(this.a);
    const b = model.anchorPoint(this.b);
    this.host.camera.getWorldDirection(this.forward);
    const n = offsetPlaneNormal(a, b, [this.forward.x, this.forward.y, this.forward.z]);
    this.host.inference.plane = { origin: a, normal: n };
    const d = norm3(sub3(b, a));
    this.offset = axisOffset(sub3(p.snap.point, a), d);
    this.previewGhost(a, b);
    this.host.measure(formatLength(dist3(a, b), this.host.unit), 'medida da cota');
    this.host.requestRender();
  }

  private previewGhost(a: Vec3, b: Vec3): void {
    const a2 = add3(a, this.offset);
    const b2 = add3(b, this.offset);
    this.host.overlay.polyline([a, a2]);
    this.host.overlay.polyline([b, b2]);
    this.host.overlay.polyline([a2, b2]);
  }

  private place(): void {
    if (!this.a || !this.b) return;
    this.host.model.addDimension(this.a, this.b, this.offset);
    this.host.refreshModel();
    this.host.commit('Cota');
    this.a = null;
    this.b = null;
    this.offset = [0, 0, 0];
    this.reset();
    this.host.status(this.hint());
  }

  value(text: string): boolean {
    if (!this.a || !this.b) return false;
    const d = parseLength(text, this.host.unit);
    if (d === null) return false;
    const dir = len3(this.offset) > 1e-6 ? norm3(this.offset) : [0, 0, 1];
    this.offset = mul3(dir as Vec3, d);
    this.place();
    return true;
  }

  key(e: KeyboardEvent): boolean {
    if (this.a && this.b && handleAxisKey(this.host, e)) return true;
    if (e.key === 'Escape') {
      this.cancel();
      return true;
    }
    return false;
  }

  cancel(): void {
    this.a = null;
    this.b = null;
    this.offset = [0, 0, 0];
    this.reset();
    this.host.status(this.hint());
  }
}

/**
 * Texto com linha de chamada. O texto inicial já vem preenchido com o que faz
 * sentido para o que foi clicado — área da face, comprimento da aresta ou as
 * coordenadas do ponto. Duplo clique na etiqueta reescreve.
 */
export class TextoTool extends Tool {
  readonly id: ToolId = 'texto';
  private anchor: Anchor | null = null;
  private texto = '';

  hint(): string {
    return this.anchor
      ? 'Afaste a chamada e clique para soltar o texto.'
      : 'Clique numa face, aresta ou ponto para anotar.';
  }

  private describe(snap: Snap): string {
    const model = this.host.model;
    if (snap.face) return formatArea(snap.face.area, this.host.unit);
    if (snap.entity?.kind === 'edge') {
      const [a, b] = model.edgePoints(snap.entity.id);
      return formatLength(dist3(a, b), this.host.unit);
    }
    const [x, y, z] = snap.point;
    const f = (n: number) => formatLength(n, this.host.unit, this.host.unit === 'm' ? 2 : 0);
    return `${f(x)} · ${f(y)} · ${f(z)}`;
  }

  pointerDown(p: PointerInfo): void {
    if (!this.anchor) {
      const a = anchorFrom(p.snap);
      this.anchor = this.host.model.makeAnchor(a.p, a.v);
      this.texto = this.describe(p.snap);
      this.host.inference.base = this.anchor.p;
      this.host.status(this.hint());
      return;
    }
    const base = this.host.model.anchorPoint(this.anchor);
    const offset = sub3(this.lastPoint ?? base, base);
    if (len3(offset) < 1e-3) return;
    this.host.model.addNote(this.anchor, offset, this.texto);
    this.host.refreshModel();
    this.host.commit('Texto');
    this.anchor = null;
    this.reset();
    this.host.status(this.hint());
  }

  private lastPoint: Vec3 | null = null;

  pointerMove(p: PointerInfo): void {
    this.host.overlay.clear();
    if (!this.anchor) {
      if (p.snap.face) this.host.overlay.polyline(this.host.model.faceLoopPoints(p.snap.face), true);
      this.host.measure(this.describe(p.snap), 'vai virar o texto');
      this.host.requestRender();
      return;
    }
    const base = this.host.model.anchorPoint(this.anchor);
    this.lastPoint = p.snap.point;
    this.host.overlay.polyline([base, p.snap.point]);
    this.host.measure(this.texto, 'texto da nota');
    this.host.requestRender();
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.cancel();
      return true;
    }
    return false;
  }

  cancel(): void {
    this.anchor = null;
    this.lastPoint = null;
    this.reset();
    this.host.status(this.hint());
  }
}
