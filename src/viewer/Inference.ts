import * as THREE from 'three';
import type { Model } from '../core/model';
import type { ModelView } from './ModelView';
import type { EntityRef, Face } from '../core/types';
import {
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  add3,
  dist3,
  dot3,
  lineLineClosest,
  mul3,
  rayPlane,
  sub3,
  type Vec3,
} from '../core/math';
import { AXIS_COLORS } from './Overlay';

export type SnapType =
  | 'ponto'
  | 'meio'
  | 'aresta'
  | 'face'
  | 'eixo'
  | 'guia'
  | 'origem'
  | 'plano'
  | 'livre';

export interface Snap {
  point: Vec3;
  type: SnapType;
  label: string;
  color: number;
  entity?: EntityRef;
  face?: Face;
  axis?: 'x' | 'y' | 'z';
  /** Guia a desenhar (do ponto de origem até o ponto inferido). */
  guideFrom?: Vec3;
}

const SNAP_COLORS: Record<SnapType, number> = {
  ponto: 0x1f9d55,
  meio: 0x14b8c4,
  aresta: 0xd6304a,
  face: 0x2f6fe0,
  eixo: 0x8b93a3,
  guia: 0x7a5cd0,
  origem: 0xe0a32e,
  plano: 0x8b93a3,
  livre: 0x8b93a3,
};

const AXES: { key: 'x' | 'y' | 'z'; dir: Vec3; name: string }[] = [
  { key: 'x', dir: AXIS_X, name: 'no eixo vermelho' },
  { key: 'y', dir: AXIS_Y, name: 'no eixo verde' },
  { key: 'z', dir: AXIS_Z, name: 'no eixo azul' },
];

/**
 * Motor de inferência: decide em que ponto do espaço o cursor "gruda".
 * A ordem de prioridade imita a do SketchUp — extremidade, meio, aresta,
 * alinhamento com eixo, face, e por fim o plano de trabalho.
 */
export class Inference {
  base: Vec3 | null = null;
  lockAxis: 'x' | 'y' | 'z' | null = null;
  plane: { origin: Vec3; normal: Vec3 } | null = null;
  enabled = true;

  private model: Model;
  private view: ModelView;

  constructor(model: Model, view: ModelView) {
    this.model = model;
    this.view = view;
  }

  reset(): void {
    this.base = null;
    this.lockAxis = null;
    this.plane = null;
  }

  resolve(
    raycaster: THREE.Raycaster,
    screen: THREE.Vector2,
    camera: THREE.PerspectiveCamera,
    size: { width: number; height: number },
  ): Snap {
    const project = (p: Vec3): THREE.Vector2 => {
      const v = new THREE.Vector3(p[0], p[1], p[2]).project(camera);
      return new THREE.Vector2(((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height);
    };
    const pxDist = (p: Vec3) => project(p).distanceTo(screen);
    const ro: Vec3 = [raycaster.ray.origin.x, raycaster.ray.origin.y, raycaster.ray.origin.z];
    const rd: Vec3 = [raycaster.ray.direction.x, raycaster.ray.direction.y, raycaster.ray.direction.z];

    // Eixo travado pelo teclado: nada mais importa.
    if (this.base && this.lockAxis) {
      const axis = AXES.find((a) => a.key === this.lockAxis)!;
      const point = this.closestOnLine(ro, rd, this.base, axis.dir) ?? this.base;
      return {
        point,
        type: 'eixo',
        axis: axis.key,
        color: AXIS_COLORS[axis.key],
        label: `travado ${axis.name}`,
        guideFrom: this.base,
      };
    }

    if (this.enabled) {
      // 1 — extremidades
      let best: Snap | null = null;
      let bestPx = 12;
      for (const v of this.model.vertices.values()) {
        const d = pxDist(v.p);
        if (d < bestPx) {
          bestPx = d;
          best = {
            point: v.p,
            type: 'ponto',
            color: SNAP_COLORS.ponto,
            label: 'extremidade',
            entity: { kind: 'vertex', id: v.id },
          };
        }
      }
      if (best) return this.withOrigin(best);

      // 2 — meio de aresta
      bestPx = 11;
      for (const e of this.model.edges.values()) {
        const [a, b] = this.model.edgePoints(e.id);
        const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        const d = pxDist(mid);
        if (d < bestPx) {
          bestPx = d;
          best = {
            point: mid,
            type: 'meio',
            color: SNAP_COLORS.meio,
            label: 'ponto médio',
            entity: { kind: 'edge', id: e.id },
          };
        }
      }
      if (best) return this.withOrigin(best);

      // 2b — pontos-guia deixados pela trena
      bestPx = 11;
      for (const g of this.model.guides.values()) {
        if (g.dir) continue;
        const d = pxDist(g.p);
        if (d < bestPx) {
          bestPx = d;
          best = {
            point: g.p,
            type: 'guia',
            color: SNAP_COLORS.guia,
            label: 'ponto-guia',
            entity: { kind: 'guia', id: g.id },
          };
        }
      }
      if (best) return this.withOrigin(best);

      // 3 — alinhamento com os eixos a partir do ponto de origem
      if (this.base) {
        let axisBest: Snap | null = null;
        let axisPx = 10;
        for (const axis of AXES) {
          const p = this.closestOnLine(ro, rd, this.base, axis.dir);
          if (!p) continue;
          if (dist3(p, this.base) < 1e-3) continue;
          const d = pxDist(p);
          if (d < axisPx) {
            axisPx = d;
            axisBest = {
              point: p,
              type: 'eixo',
              axis: axis.key,
              color: AXIS_COLORS[axis.key],
              label: axis.name,
              guideFrom: this.base,
            };
          }
        }
        if (axisBest) return axisBest;
      }

      // 4 — sobre aresta
      bestPx = 8;
      for (const e of this.model.edges.values()) {
        const [a, b] = this.model.edgePoints(e.id);
        const ab = sub3(b, a);
        const hit = lineLineClosest(ro, rd, a, ab);
        if (!hit) continue;
        if (hit.t1 < 0) continue;
        const t = Math.max(0, Math.min(1, hit.t2));
        const p = add3(a, mul3(ab, t));
        const d = pxDist(p);
        if (d < bestPx) {
          bestPx = d;
          best = {
            point: p,
            type: 'aresta',
            color: SNAP_COLORS.aresta,
            label: 'sobre aresta',
            entity: { kind: 'edge', id: e.id },
          };
        }
      }
      if (best) return this.withOrigin(best);

      // 4b — sobre uma linha-guia
      bestPx = 8;
      for (const g of this.model.guides.values()) {
        if (!g.dir) continue;
        const hit = lineLineClosest(g.p, g.dir, ro, rd);
        if (!hit || hit.t2 < 0) continue;
        const p = add3(g.p, mul3(g.dir, hit.t1));
        const d = pxDist(p);
        if (d < bestPx) {
          bestPx = d;
          best = {
            point: p,
            type: 'guia',
            color: SNAP_COLORS.guia,
            label: 'na guia',
            entity: { kind: 'guia', id: g.id },
          };
        }
      }
      if (best) return this.withOrigin(best);
    }

    // 5 — face sob o cursor
    const faceHit = this.view.raycastFace(raycaster);
    if (faceHit) {
      const p: Vec3 = [faceHit.point.x, faceHit.point.y, faceHit.point.z];
      return {
        point: p,
        type: 'face',
        color: SNAP_COLORS.face,
        label: 'na face',
        face: faceHit.face,
        entity: { kind: 'face', key: faceHit.face.key },
      };
    }

    // 6 — plano de trabalho (ou o chão)
    const plane = this.plane ?? { origin: [0, 0, 0] as Vec3, normal: [0, 0, 1] as Vec3 };
    const hit = rayPlane(ro, rd, plane.origin, plane.normal);
    if (hit) {
      return { point: hit, type: 'plano', color: SNAP_COLORS.plano, label: this.plane ? 'no plano' : 'no chão' };
    }
    // 7 — nada intersecta: usa um plano paralelo à tela
    const fallbackNormal: Vec3 = [-rd[0], -rd[1], -rd[2]];
    const origin = this.base ?? [0, 0, 0];
    const p = rayPlane(ro, rd, origin, fallbackNormal) ?? origin;
    return { point: p, type: 'livre', color: SNAP_COLORS.livre, label: 'no espaço' };
  }

  private withOrigin(snap: Snap): Snap {
    if (dist3(snap.point, [0, 0, 0]) < 1e-6) {
      return { ...snap, type: 'origem', color: SNAP_COLORS.origem, label: 'origem' };
    }
    return snap;
  }

  /** Ponto da reta (origin, dir) mais próximo do raio da câmera. */
  private closestOnLine(ro: Vec3, rd: Vec3, origin: Vec3, dir: Vec3): Vec3 | null {
    const hit = lineLineClosest(origin, dir, ro, rd);
    if (!hit) return null;
    if (hit.t2 < 0) return null;
    return add3(origin, mul3(dir, hit.t1));
  }

  /** Projeta um ponto no eixo travado, mantendo o comprimento pedido. */
  static alongAxis(base: Vec3, axis: 'x' | 'y' | 'z', signedLength: number): Vec3 {
    const dir = AXES.find((a) => a.key === axis)!.dir;
    return add3(base, mul3(dir, signedLength));
  }

  static axisOf(dir: Vec3): 'x' | 'y' | 'z' | null {
    for (const a of AXES) if (Math.abs(dot3(dir, a.dir)) > 0.9995) return a.key;
    return null;
  }
}
