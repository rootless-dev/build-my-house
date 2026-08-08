import * as THREE from 'three';
import type { Face } from './types';
import type { Model } from './model';
import { planeBasis, projectToPlane, signedArea, type Vec3 } from './math';

export interface Tessellation {
  /** Outline points followed by the holes, in the order used by `tris`. */
  points: Vec3[];
  /** Planar UV coordinates (metres) for texture mapping. */
  uvs: [number, number][];
  tris: number[];
}

/** Triangulates a face (holes included) by projecting it onto its own plane. */
export function tessellateFace(model: Model, face: Face): Tessellation | null {
  const origin = model.vertexPos(face.loop[0]);
  const [u, v] = planeBasis(face.normal);

  const to2 = (p: Vec3) => projectToPlane(p, origin, u, v);
  const outer3 = face.loop.map((id) => model.vertexPos(id));
  let outer2 = outer3.map(to2);
  // ShapeUtils expects a counter-clockwise contour
  if (signedArea(outer2) < 0) {
    outer3.reverse();
    outer2 = outer3.map(to2);
  }

  const holes3: Vec3[][] = [];
  const holes2: THREE.Vector2[][] = [];
  for (const hole of face.holes) {
    const pts3 = hole.map((id) => model.vertexPos(id));
    let pts2 = pts3.map(to2);
    if (signedArea(pts2) > 0) {
      pts3.reverse();
      pts2 = pts3.map(to2);
    }
    holes3.push(pts3);
    holes2.push(pts2.map((p) => new THREE.Vector2(p[0], p[1])));
  }

  const contour = outer2.map((p) => new THREE.Vector2(p[0], p[1]));
  let faceIndices: number[][];
  try {
    faceIndices = THREE.ShapeUtils.triangulateShape(contour, holes2);
  } catch {
    return null;
  }

  const points = [...outer3, ...holes3.flat()];
  const flat2 = [...outer2, ...holes3.flat().map(to2)];
  const tris: number[] = [];
  for (const t of faceIndices) tris.push(t[0], t[1], t[2]);
  if (!tris.length) return null;
  return { points, uvs: flat2, tris };
}
