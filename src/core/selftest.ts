/* Quick check of the geometry core, run on demand from the console. */
import { Model } from './model';
import type { Vec3 } from './math';

interface Case {
  name: string;
  expected: string;
  got: string;
  ok: boolean;
}

const rect = (m: Model, x0: number, y0: number, x1: number, y1: number, z = 0) =>
  m.addPolyline(
    [
      [x0, y0, z],
      [x1, y0, z],
      [x1, y1, z],
      [x0, y1, z],
    ] as Vec3[],
    true,
  );

export function selftest(): Case[] {
  const out: Case[] = [];
  const check = (name: string, expected: unknown, got: unknown) =>
    out.push({ name, expected: String(expected), got: String(got), ok: String(expected) === String(got) });

  // 1. a closed rectangle becomes one face
  {
    const m = new Model();
    rect(m, 0, 0, 4, 3);
    check('rectangle → 1 face', 1, m.faces().length);
    check('rectangle → 12 m² area', '12.00', m.faces()[0]?.area.toFixed(2));
  }

  // 2. push/pull creates a six-faced box
  {
    const m = new Model();
    rect(m, 0, 0, 4, 3);
    m.pushPull(m.faces()[0], 2.5);
    check('box → 6 faces', 6, m.faces().length);
    check('box → 12 edges', 12, m.edges.size);
  }

  // 3. a second push/pull stretches instead of duplicating geometry
  {
    const m = new Model();
    rect(m, 0, 0, 4, 3);
    m.pushPull(m.faces()[0], 2);
    const top = m.faces().find((f) => f.normal[2] > 0.9 && f.center[2] > 1)!;
    const mode = m.pushPull(top, 1).mode;
    check('second push/pull → stretches', 'stretch', mode);
    check('still 6 faces', 6, m.faces().length);
    check('final height 3 m', 3, m.bounds()!.max[2]);
  }

  // 4. rectangle inside rectangle → face with a hole plus the inner face
  {
    const m = new Model();
    rect(m, 0, 0, 6, 4);
    rect(m, 1, 1, 3, 3);
    const faces = m.faces();
    check('split → 2 faces', 2, faces.length);
    const withHole = faces.find((f) => f.holes.length === 1);
    check('outer face has 1 hole', true, Boolean(withHole));
    check('outer face area 20 m²', '20.00', withHole?.area.toFixed(2));
  }

  // 5. an edge crossing another is split at the crossing
  {
    const m = new Model();
    m.addSegment([0, 0, 0], [4, 0, 0]);
    m.addSegment([2, -2, 0], [2, 2, 0]);
    check('crossing → 4 edges', 4, m.edges.size);
    check('crossing → 5 vertices', 5, m.vertices.size);
  }

  // 6. deleting an edge merges the neighbouring faces
  {
    const m = new Model();
    rect(m, 0, 0, 4, 2);
    m.addSegment([2, 0, 0], [2, 2, 0]);
    check('line split → 2 faces', 2, m.faces().length);
    const splitter = [...m.edges.values()].find((e) => {
      const [a, b] = m.edgePoints(e.id);
      return a[0] === 2 && b[0] === 2;
    })!;
    m.deleteEdge(splitter.id);
    check('delete splitter → 1 face', 1, m.faces().length);
  }

  // 7. punched opening: a rectangle on the wall pushed through to the far side
  {
    const m = new Model();
    rect(m, 0, 0, 4, 3);
    m.pushPull(m.faces()[0], 0.2); // a 20 cm wall lying flat
    const front = m.faces().find((f) => Math.abs(f.normal[2] - 1) < 0.01 && f.center[2] > 0.1)!;
    m.addPolyline(
      [
        [1, 1, 0.2],
        [2, 1, 0.2],
        [2, 2, 0.2],
        [1, 2, 0.2],
      ] as Vec3[],
      true,
    );
    const opening = m.faces().find((f) => Math.abs(f.area - 1) < 0.01 && f.center[2] > 0.1)!;
    check('wall split', true, Boolean(front) && Boolean(opening));
    const r = m.pushPull(opening, -0.2);
    check('push/pull punched through', true, r.cut);
    const leftover = m.faces().some((f) => Math.abs(f.area - 1) < 0.01 && Math.abs(f.normal[2]) > 0.9);
    check('opening is clear (no caps)', false, leftover);
  }

  // 8. a dimension pins to the vertex and follows when the geometry moves
  {
    const m = new Model();
    rect(m, 0, 0, 4, 3);
    const corners = [...m.vertices.values()];
    const a = corners.find((v) => v.p[0] === 0 && v.p[1] === 0)!;
    const b = corners.find((v) => v.p[0] === 4 && v.p[1] === 0)!;
    m.addDimension(m.makeAnchor(a.p, a.id), m.makeAnchor(b.p, b.id), [0, -1, 0]);
    const dim = [...m.dimensions.values()][0];
    check('dimension reads 4 m', 4, dist(m.anchorPoint(dim.a), m.anchorPoint(dim.b)));
    m.translateVertices([b.id], [2, 0, 0]);
    check('dimension follows the vertex', 6, dist(m.anchorPoint(dim.a), m.anchorPoint(dim.b)));
  }

  // 9. annotations survive a save-and-open round trip
  {
    const m = new Model();
    rect(m, 0, 0, 2, 2);
    m.addDimension(m.makeAnchor([0, 0, 0]), m.makeAnchor([2, 0, 0]), [0, -1, 0]);
    m.addNote(m.makeAnchor([1, 1, 0]), [0, 0, 1], 'sala');
    m.addGuide([0, 1, 0], [1, 0, 0]);
    const copy = new Model();
    copy.loadSnapshot(JSON.parse(JSON.stringify(m.toSnapshot())));
    check('dimensions saved', 1, copy.dimensions.size);
    check('notes saved', 'sala', [...copy.notes.values()][0]?.text);
    check('guides saved', 1, copy.guides.size);
    check('faces preserved', 1, copy.faces().length);
  }

  // 10. a version 1 file (no annotations) still opens
  {
    const m = new Model();
    rect(m, 0, 0, 3, 3);
    const legacy = { ...m.toSnapshot(), version: 1 as const };
    delete (legacy as { dimensions?: unknown }).dimensions;
    delete (legacy as { notes?: unknown }).notes;
    delete (legacy as { guides?: unknown }).guides;
    const copy = new Model();
    copy.loadSnapshot(legacy);
    check('v1 project opens', 1, copy.faces().length);
    check('v1 project has no dimensions', 0, copy.dimensions.size);
  }

  return out;
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

declare global {
  interface Window {
    selftest?: () => Case[];
  }
}
window.selftest = selftest;
