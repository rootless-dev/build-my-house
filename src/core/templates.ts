/**
 * Starting points offered on the menu screen. Each builds a throwaway `Model`
 * and returns its snapshot — nothing here touches the model in use.
 */

import { Model } from './model';
import type { ModelSnapshot } from './types';
import type { Vec3 } from './math';

export interface Template {
  id: string;
  name: string;
  hint: string;
  build(): ModelSnapshot;
}

function rect(w: number, d: number): Vec3[] {
  const x = w / 2;
  const y = d / 2;
  return [
    [-x, -y, 0],
    [x, -y, 0],
    [x, y, 0],
    [-x, y, 0],
  ];
}

/** Extrudes the largest horizontal face of the model — the floor just closed. */
function extrudeFloor(model: Model, height: number): void {
  const floor = model
    .faces()
    .filter((f) => Math.abs(f.normal[2]) > 0.9)
    .sort((a, b) => b.area - a.area)[0];
  // The derived normal may point down; the sign makes sure the extrusion always
  // goes up, no matter which way the loop was closed.
  if (floor) model.pushPull(floor, floor.normal[2] >= 0 ? height : -height);
}

export const TEMPLATES: Template[] = [
  {
    id: 'blank',
    name: 'Em branco',
    hint: 'Só os eixos e o chão',
    build: () => new Model().toSnapshot(),
  },
  {
    id: 'plan',
    name: 'Planta 12 × 9',
    hint: 'Contorno no chão, pronto para empurrar',
    build: () => {
      const m = new Model();
      m.addPolyline(rect(12, 9), true);
      return m.toSnapshot();
    },
  },
  {
    id: 'singlestorey',
    name: 'Casa térrea',
    hint: '10 × 8 m com pé-direito de 2,80',
    build: () => {
      const m = new Model();
      m.addPolyline(rect(10, 8), true);
      extrudeFloor(m, 2.8);
      return m.toSnapshot();
    },
  },
  {
    id: 'lshape',
    name: 'Planta em L',
    hint: 'Volume recortado, 2,80 de altura',
    build: () => {
      const m = new Model();
      const pts: Vec3[] = [
        [-6, -4.5, 0],
        [4, -4.5, 0],
        [4, 0.5, 0],
        [0, 0.5, 0],
        [0, 4.5, 0],
        [-6, 4.5, 0],
      ];
      m.addPolyline(pts, true);
      extrudeFloor(m, 2.8);
      return m.toSnapshot();
    },
  },
];
