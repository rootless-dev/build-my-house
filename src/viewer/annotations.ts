/**
 * Geometria das anotações: cotas, textos com linha de chamada e guias.
 * Vive fora do grafo de arestas — nada disso vira face nem sai na exportação
 * de malha. As etiquetas saem daqui como posições 3D; quem as desenha em DOM
 * é o Viewport, para o texto ficar sempre nítido e de frente.
 */

import type { Model } from '../core/model';
import type { ID } from '../core/types';
import { add3, cross3, dist3, len3, mul3, norm3, sub3, type Vec3 } from '../core/math';
import { formatLength, type Unit } from '../core/units';

export type AnnotationKind = 'cota' | 'texto' | 'guia';

export const refKey = (kind: AnnotationKind, id: ID): string => `${kind}:${id}`;

export interface LabelSpec {
  key: string;
  kind: 'cota' | 'texto';
  id: ID;
  text: string;
  pos: Vec3;
  selected: boolean;
}

export interface AnnotationBuild {
  lines: number[];
  selectedLines: number[];
  guideLines: number[];
  guidePoints: number[];
  labels: LabelSpec[];
}

const push = (out: number[], a: Vec3, b: Vec3) => out.push(a[0], a[1], a[2], b[0], b[1], b[2]);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Vetor perpendicular a `d` qualquer, para quando a cota nasce sem deslocamento. */
function anyPerp(d: Vec3): Vec3 {
  const helper: Vec3 = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  return norm3(cross3(helper, d));
}

/** Extensão das guias e tamanho das marcas, proporcionais ao modelo. */
function modelScale(model: Model): number {
  const b = model.bounds();
  if (!b) return 10;
  return Math.max(10, dist3(b.min, b.max));
}

export function buildAnnotations(
  model: Model,
  unit: Unit,
  selected: ReadonlySet<string>,
  showGuides = true,
): AnnotationBuild {
  const out: AnnotationBuild = { lines: [], selectedLines: [], guideLines: [], guidePoints: [], labels: [] };
  const scale = modelScale(model);

  for (const dim of model.dimensions.values()) {
    const key = refKey('cota', dim.id);
    const isSel = selected.has(key);
    const target = isSel ? out.selectedLines : out.lines;
    const a = model.anchorPoint(dim.a);
    const b = model.anchorPoint(dim.b);
    const span = sub3(b, a);
    const length = len3(span);
    if (length < 1e-6) continue;
    const u = norm3(span);
    const w = len3(dim.offset) > 1e-6 ? norm3(dim.offset) : anyPerp(u);
    const a2 = add3(a, dim.offset);
    const b2 = add3(b, dim.offset);
    const tick = clamp(length * 0.035, 0.04, 0.3);
    const gap = tick * 0.4;

    // linhas de chamada, com folga junto ao ponto medido
    push(target, add3(a, mul3(w, gap)), add3(a2, mul3(w, tick * 0.7)));
    push(target, add3(b, mul3(w, gap)), add3(b2, mul3(w, tick * 0.7)));
    // linha de cota
    push(target, a2, b2);
    // marcas a 45° nas pontas, no estilo do SketchUp
    const slash = mul3(norm3(add3(u, w)), tick * 0.5);
    push(target, sub3(a2, slash), add3(a2, slash));
    push(target, sub3(b2, slash), add3(b2, slash));

    out.labels.push({
      key,
      kind: 'cota',
      id: dim.id,
      text: formatLength(length, unit),
      pos: add3(add3(a2, mul3(span, 0.5)), mul3(w, tick * 1.1)),
      selected: isSel,
    });
  }

  for (const note of model.notes.values()) {
    const key = refKey('texto', note.id);
    const isSel = selected.has(key);
    const target = isSel ? out.selectedLines : out.lines;
    const anchor = model.anchorPoint(note.anchor);
    const tip = add3(anchor, note.offset);
    push(target, anchor, tip);
    const dot = clamp(scale * 0.004, 0.02, 0.12);
    push(target, sub3(anchor, [dot, 0, 0]), add3(anchor, [dot, 0, 0]));
    push(target, sub3(anchor, [0, dot, 0]), add3(anchor, [0, dot, 0]));
    out.labels.push({ key, kind: 'texto', id: note.id, text: note.text, pos: tip, selected: isSel });
  }

  if (!showGuides) return out;

  const reach = scale * 1.1;
  const cross = clamp(scale * 0.006, 0.03, 0.2);
  for (const guide of model.guides.values()) {
    const isSel = selected.has(refKey('guia', guide.id));
    if (guide.dir) {
      const half = mul3(guide.dir, reach);
      const target = isSel ? out.selectedLines : out.guideLines;
      push(target, sub3(guide.p, half), add3(guide.p, half));
    } else {
      const target = isSel ? out.selectedLines : out.guidePoints;
      push(target, sub3(guide.p, [cross, 0, 0]), add3(guide.p, [cross, 0, 0]));
      push(target, sub3(guide.p, [0, cross, 0]), add3(guide.p, [0, cross, 0]));
      push(target, sub3(guide.p, [0, 0, cross]), add3(guide.p, [0, 0, cross]));
    }
  }

  return out;
}
