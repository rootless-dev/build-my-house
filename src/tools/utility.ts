import { Tool, type PointerInfo, type ToolId } from './base';
import type { EntityRef } from '../core/types';
import { add3, dist3, dot3, len3, mul3, norm3, sub3, type Vec3 } from '../core/math';
import { formatArea, formatLength, parseLength } from '../core/units';

const sameRef = (a: EntityRef, b: EntityRef): boolean =>
  a.kind === b.kind && (a.kind === 'face' ? a.key === (b as typeof a).key : (a as { id: number }).id === (b as { id: number }).id);

export class SelectTool extends Tool {
  readonly id: ToolId = 'select';
  cursor = 'default';

  hint(): string {
    return 'Clique para selecionar. Shift alterna, duplo clique pega a face com as arestas, Delete apaga.';
  }

  pointerDown(p: PointerInfo): void {
    const ref = p.snap.entity;
    const current = this.host.getSelection();
    if (!ref) {
      if (!p.shift) this.host.setSelection([]);
      return;
    }
    if (p.shift) {
      const exists = current.some((r) => sameRef(r, ref));
      this.host.setSelection(exists ? current.filter((r) => !sameRef(r, ref)) : [...current, ref]);
    } else {
      this.host.setSelection([ref]);
    }
  }

  pointerMove(p: PointerInfo): void {
    this.host.overlay.clear();
    if (p.snap.face) this.host.overlay.polyline(this.host.model.faceLoopPoints(p.snap.face), true);
    const f = p.snap.face;
    this.host.measure(f ? formatArea(f.area, this.host.unit) : '', f ? 'área da face' : '');
    this.host.requestRender();
  }

  doubleClick(p: PointerInfo): void {
    if (!p.snap.face) return;
    const face = p.snap.face;
    const refs: EntityRef[] = [{ kind: 'face', key: face.key }];
    for (const id of this.host.model.edgesOfFace(face)) refs.push({ kind: 'edge', id });
    this.host.setSelection(refs);
  }
}

export class EraserTool extends Tool {
  readonly id: ToolId = 'eraser';
  cursor = 'cell';
  private down = false;
  private touched = false;

  hint(): string {
    return 'Arraste sobre arestas, guias ou etiquetas para apagar. Numa face, apaga só a face; Ctrl suaviza a aresta.';
  }

  pointerDown(p: PointerInfo): void {
    this.down = true;
    this.touched = false;
    this.erase(p);
  }

  pointerMove(p: PointerInfo): void {
    if (this.down) this.erase(p);
    else {
      this.host.overlay.clear();
      if (p.snap.entity?.kind === 'edge') {
        const [a, b] = this.host.model.edgePoints(p.snap.entity.id);
        this.host.overlay.polyline([a, b]);
      }
      this.host.requestRender();
    }
  }

  pointerUp(): void {
    this.down = false;
    if (this.touched) this.host.commit('Apagar');
    this.touched = false;
  }

  private erase(p: PointerInfo): void {
    const ref = p.snap.entity;
    if (!ref) return;
    if (ref.kind === 'edge') {
      if (p.ctrl) {
        const e = this.host.model.edges.get(ref.id);
        if (e) {
          e.smooth = !e.smooth;
          this.host.model.revision++;
        }
      } else {
        this.host.model.deleteEdge(ref.id);
      }
      this.touched = true;
      this.host.refreshModel();
    } else if (ref.kind === 'guide') {
      this.host.model.deleteAnnotation(ref);
      this.touched = true;
      this.host.refreshModel();
    } else if (ref.kind === 'face' && !this.down) {
      this.host.model.deleteFace(ref.key);
      this.touched = true;
      this.host.refreshModel();
    }
  }
}

export class PaintTool extends Tool {
  readonly id: ToolId = 'paint';
  cursor = 'copy';

  hint(): string {
    return 'Clique numa face para aplicar o material. Alt+clique copia o material da face.';
  }

  pointerMove(p: PointerInfo): void {
    this.host.overlay.clear();
    if (p.snap.face) this.host.overlay.polyline(this.host.model.faceLoopPoints(p.snap.face), true);
    this.host.requestRender();
  }

  pointerDown(p: PointerInfo): void {
    if (!p.snap.face) return;
    const key = p.snap.face.key;
    if (p.alt) {
      const mat = this.host.model.faceMaterials.get(key) ?? null;
      this.host.setActiveMaterial(mat);
      this.host.toast(mat ? `Material copiado: ${this.host.model.materials.get(mat)?.name}` : 'Face sem material.');
      return;
    }
    this.host.model.applyMaterial(key, this.host.getActiveMaterial());
    this.host.refreshModel();
    this.host.commit('Pintar');
  }
}

/**
 * Tape measure: measures and leaves guides, like SketchUp's tape.
 *  - starting from an edge, dragging creates a parallel guide line;
 *  - starting from a point, the second click leaves a guide point;
 *  - with Ctrl held it only measures and creates nothing.
 */
export class TapeTool extends Tool {
  readonly id: ToolId = 'tape';
  private from: Vec3 | null = null;
  private edge: { a: Vec3; b: Vec3 } | null = null;
  private target: Vec3 | null = null;
  private distance = 0;
  private measureOnly = false;

  hint(): string {
    if (this.edge) return 'Afaste para criar a guia paralela, ou digite a distância. Ctrl só mede.';
    if (this.from) return 'Clique no segundo ponto: fica a medida e um ponto-guia. Ctrl só mede.';
    return 'Clique num ponto para medir, ou numa aresta para tirar uma paralela.';
  }

  pointerDown(p: PointerInfo): void {
    this.measureOnly = p.ctrl;
    if (this.edge || this.from) {
      this.finish(p);
      return;
    }
    if (p.snap.entity?.kind === 'edge' && p.snap.type === 'edge') {
      const [a, b] = this.host.model.edgePoints(p.snap.entity.id);
      this.edge = { a, b };
      this.host.inference.base = p.snap.point;
    } else {
      this.from = p.snap.point;
      this.host.inference.base = this.from;
    }
    this.host.status(this.hint());
  }

  pointerMove(p: PointerInfo): void {
    this.host.overlay.clear();
    if (this.edge) {
      const dir = norm3(sub3(this.edge.b, this.edge.a));
      const rel = sub3(p.snap.point, this.edge.a);
      const perp = sub3(rel, mul3(dir, dot3(rel, dir)));
      this.distance = len3(perp);
      this.target = add3(this.edge.a, perp);
      const reach = mul3(dir, Math.max(dist3(this.edge.a, this.edge.b), 1) * 1.5);
      this.host.overlay.guide(sub3(this.target, reach), add3(this.target, reach), 'neutral');
      this.host.measure(formatLength(this.distance, this.host.unit), 'afastamento');
      this.host.requestRender();
      return;
    }
    if (!this.from) {
      this.host.measure('', 'medida');
      return;
    }
    this.target = p.snap.point;
    this.distance = dist3(this.from, this.target);
    this.host.overlay.polyline([this.from, this.target]);
    if (p.snap.axis && p.snap.guideFrom) this.host.overlay.guide(p.snap.guideFrom, this.target, p.snap.axis);
    this.host.measure(formatLength(this.distance, this.host.unit), 'medida');
    this.host.requestRender();
  }

  private finish(p?: PointerInfo): void {
    const measureOnly = this.measureOnly || p?.ctrl;
    if (this.edge && this.target && this.distance > 1e-4) {
      const dir = norm3(sub3(this.edge.b, this.edge.a));
      if (!measureOnly) {
        this.host.model.addGuide(this.target, dir);
        this.host.refreshModel();
        this.host.commit('Guia paralela');
      }
      this.host.toast(`Afastamento: ${formatLength(this.distance, this.host.unit)}`);
    } else if (this.from && this.target && this.distance > 1e-4) {
      if (!measureOnly) {
        this.host.model.addGuide(this.target, null);
        this.host.refreshModel();
        this.host.commit('Ponto-guia');
      }
      this.host.toast(`Distância: ${formatLength(this.distance, this.host.unit)}`);
    }
    this.cancel();
  }

  value(text: string): boolean {
    if (!this.edge && !this.from) return false;
    const d = parseLength(text, this.host.unit);
    if (d === null || d <= 0) return false;
    if (this.edge && this.target) {
      const dir = norm3(sub3(this.edge.b, this.edge.a));
      const rel = sub3(this.target, this.edge.a);
      const perp = sub3(rel, mul3(dir, dot3(rel, dir)));
      const unit = len3(perp) > 1e-6 ? norm3(perp) : null;
      if (!unit) return false;
      this.target = add3(this.edge.a, mul3(unit, d));
      this.distance = d;
    } else if (this.from && this.target) {
      const dir = norm3(sub3(this.target, this.from));
      if (!len3(dir)) return false;
      this.target = add3(this.from, mul3(dir, d));
      this.distance = d;
    }
    this.finish();
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
    this.from = null;
    this.edge = null;
    this.target = null;
    this.distance = 0;
    this.measureOnly = false;
    this.reset();
    this.host.status(this.hint());
  }
}

class NavTool extends Tool {
  readonly id: ToolId;
  private kind: 'orbit' | 'pan';
  private down = false;
  private last = { x: 0, y: 0 };

  constructor(host: ConstructorParameters<typeof Tool>[0], id: ToolId, kind: 'orbit' | 'pan') {
    super(host);
    this.id = id;
    this.kind = kind;
    this.cursor = kind === 'orbit' ? 'grab' : 'move';
  }

  hint(): string {
    return this.kind === 'orbit'
      ? 'Arraste para orbitar. O botão do meio faz isso em qualquer ferramenta.'
      : 'Arraste para deslocar a vista. Shift + botão do meio faz isso em qualquer ferramenta.';
  }

  pointerDown(p: PointerInfo): void {
    this.down = true;
    this.last = { x: p.x, y: p.y };
  }

  pointerMove(p: PointerInfo): void {
    if (!this.down) return;
    this.host.navigate(this.kind, p.x - this.last.x, p.y - this.last.y);
    this.last = { x: p.x, y: p.y };
  }

  pointerUp(): void {
    this.down = false;
  }
}

export class OrbitTool extends NavTool {
  constructor(host: ConstructorParameters<typeof Tool>[0]) {
    super(host, 'orbit', 'orbit');
  }
}

export class PanTool extends NavTool {
  constructor(host: ConstructorParameters<typeof Tool>[0]) {
    super(host, 'pan', 'pan');
  }
}
