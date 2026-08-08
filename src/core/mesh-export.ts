/**
 * Exporters that need to triangulate faces — and therefore need three.js.
 * They live outside `io.ts` so the menu can read and write projects without
 * dragging the 3D engine into the initial load.
 */

import type { Model } from './model';
import { tessellateFace } from './tessellate';
import { cross3, norm3, sub3, type Vec3 } from './math';

export function exportOBJ(model: Model, name = 'modelo'): string {
  const lines: string[] = [`# ${name} — exportado do Build my House`, 'mtllib modelo.mtl'];
  const verts: string[] = [];
  const body: string[] = [];
  let base = 1;
  const byMaterial = new Map<string, string[]>();

  for (const face of model.faces()) {
    const t = tessellateFace(model, face);
    if (!t) continue;
    // OBJ is Y-up; the model is Z-up: (X, Y, Z) → (X, Z, -Y)
    for (const p of t.points) verts.push(`v ${p[0].toFixed(6)} ${p[2].toFixed(6)} ${(-p[1]).toFixed(6)}`);
    const mat = model.faceMaterials.get(face.key) ?? 'padrao';
    const chunk = byMaterial.get(mat) ?? [];
    for (let i = 0; i < t.tris.length; i += 3) {
      chunk.push(`f ${base + t.tris[i]} ${base + t.tris[i + 1]} ${base + t.tris[i + 2]}`);
    }
    byMaterial.set(mat, chunk);
    base += t.points.length;
  }
  for (const [mat, faces] of byMaterial) {
    body.push(`usemtl ${mat}`, ...faces);
  }
  return [...lines, ...verts, ...body, ''].join('\n');
}

export function exportSTL(model: Model, name = 'modelo'): string {
  const out: string[] = [`solid ${name}`];
  for (const face of model.faces()) {
    const t = tessellateFace(model, face);
    if (!t) continue;
    for (let i = 0; i < t.tris.length; i += 3) {
      const a = t.points[t.tris[i]];
      const b = t.points[t.tris[i + 1]];
      const c = t.points[t.tris[i + 2]];
      const n: Vec3 = norm3(cross3(sub3(b, a), sub3(c, a)));
      out.push(`  facet normal ${n[0]} ${n[1]} ${n[2]}`, '    outer loop');
      for (const p of [a, b, c]) out.push(`      vertex ${p[0]} ${p[1]} ${p[2]}`);
      out.push('    endloop', '  endfacet');
    }
  }
  out.push(`endsolid ${name}`, '');
  return out.join('\n');
}
