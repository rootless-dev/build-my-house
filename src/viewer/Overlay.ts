import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { Vec3 } from '../core/math';

export const AXIS_COLORS = { x: 0xd6304a, y: 0x2e9e5b, z: 0x2e6fd6 };

/** Ephemeral 3D layer: drawing rubber bands, axis guides and previews. */
export class Overlay {
  group = new THREE.Group();

  private rubberMat = new LineMaterial({ color: 0x101318, linewidth: 2, worldUnits: false });
  private guideMats: Record<string, LineMaterial> = {
    x: new LineMaterial({ color: AXIS_COLORS.x, linewidth: 1.6, dashed: true, dashSize: 0.16, gapSize: 0.12 }),
    y: new LineMaterial({ color: AXIS_COLORS.y, linewidth: 1.6, dashed: true, dashSize: 0.16, gapSize: 0.12 }),
    z: new LineMaterial({ color: AXIS_COLORS.z, linewidth: 1.6, dashed: true, dashSize: 0.16, gapSize: 0.12 }),
    neutral: new LineMaterial({ color: 0x6d7480, linewidth: 1.4, dashed: true, dashSize: 0.14, gapSize: 0.1 }),
  };
  private ghostMat = new THREE.MeshBasicMaterial({
    color: 0x2f6fe0,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private disposables: THREE.BufferGeometry[] = [];

  constructor() {
    this.group.renderOrder = 10;
    for (const m of Object.values(this.guideMats)) m.depthTest = false;
    this.rubberMat.depthTest = false;
  }

  setResolution(w: number, h: number): void {
    this.rubberMat.resolution.set(w, h);
    for (const m of Object.values(this.guideMats)) m.resolution.set(w, h);
  }

  clear(): void {
    for (const g of this.disposables) g.dispose();
    this.disposables = [];
    this.group.clear();
  }

  polyline(points: Vec3[], closed = false): void {
    if (points.length < 2) return;
    const coords: number[] = [];
    const limit = closed ? points.length : points.length - 1;
    for (let i = 0; i < limit; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      coords.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    this.addSegments(coords, this.rubberMat);
  }

  guide(from: Vec3, to: Vec3, axis: 'x' | 'y' | 'z' | 'neutral'): void {
    this.addSegments([from[0], from[1], from[2], to[0], to[1], to[2]], this.guideMats[axis]);
  }

  /** Translucent prism showing where push/pull will take the face. */
  ghostPrism(loop: Vec3[], normal: Vec3, dist: number): void {
    if (loop.length < 3 || Math.abs(dist) < 1e-6) return;
    const top = loop.map((p): Vec3 => [p[0] + normal[0] * dist, p[1] + normal[1] * dist, p[2] + normal[2] * dist]);
    const pos: number[] = [];
    for (let i = 0; i < loop.length; i++) {
      const j = (i + 1) % loop.length;
      const a = loop[i];
      const b = loop[j];
      const c = top[j];
      const d = top[i];
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.disposables.push(geo);
    const mesh = new THREE.Mesh(geo, this.ghostMat);
    mesh.renderOrder = 9;
    this.group.add(mesh);
    this.polyline(top, true);
  }

  private addSegments(coords: number[], material: LineMaterial): void {
    const geo = new LineSegmentsGeometry();
    geo.setPositions(coords);
    this.disposables.push(geo);
    const line = new LineSegments2(geo, material);
    line.computeLineDistances();
    line.frustumCulled = false;
    line.renderOrder = 11;
    this.group.add(line);
  }

  dispose(): void {
    this.clear();
    this.rubberMat.dispose();
    this.ghostMat.dispose();
    for (const m of Object.values(this.guideMats)) m.dispose();
  }
}
