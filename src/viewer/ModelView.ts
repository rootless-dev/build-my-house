import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { Model } from '../core/model';
import type { Face } from '../core/types';
import { tessellateFace } from '../core/tessellate';
import { buildAnnotations, type LabelSpec } from './annotations';
import type { Unit } from '../core/units';

export type ViewStyle = 'shaded' | 'wireframe' | 'hiddenline' | 'xray';

const BACK_COLOR = 0x7f96ab;
const DEFAULT_FRONT = 0xf3f1ec;
const EDGE_COLOR = 0x22262c;

interface Bucket {
  pos: number[];
  nor: number[];
  uv: number[];
  idx: number[];
}

/** Builds the three.js objects from the model. Full rebuild on every change —
 *  the models here are small and it keeps everything predictable. */
export class ModelView {
  group = new THREE.Group();
  pickMesh: THREE.Mesh | null = null;
  /** Dimension and note labels, drawn in the DOM by the Viewport. */
  labels: LabelSpec[] = [];

  private faceMats = new Map<string, THREE.MeshStandardMaterial>();
  private backMat = new THREE.MeshStandardMaterial({
    color: BACK_COLOR,
    side: THREE.BackSide,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  });
  private edgeMat = new LineMaterial({ color: EDGE_COLOR, linewidth: 1.4, worldUnits: false });
  private profileMat = new LineMaterial({ color: EDGE_COLOR, linewidth: 2.6, worldUnits: false });
  private selEdgeMat = new LineMaterial({ color: 0x2f6fe0, linewidth: 3.4, worldUnits: false });
  private annotationMat = new LineMaterial({ color: 0x2b3038, linewidth: 1.3, worldUnits: false });
  private guideMat = new LineMaterial({
    color: 0x5b6472,
    linewidth: 1.1,
    dashed: true,
    dashSize: 0.22,
    gapSize: 0.16,
    transparent: true,
    opacity: 0.85,
    worldUnits: false,
  });
  private selFaceMat = new THREE.MeshBasicMaterial({
    color: 0x2f6fe0,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private pickLookup: Face[] = [];
  private disposables: (THREE.BufferGeometry | THREE.Material)[] = [];

  setResolution(w: number, h: number): void {
    for (const m of [this.edgeMat, this.profileMat, this.selEdgeMat, this.annotationMat, this.guideMat]) {
      m.resolution.set(w, h);
    }
  }

  private materialFor(model: Model, id: string | undefined): THREE.MeshStandardMaterial {
    const key = id ?? '__default';
    let mat = this.faceMats.get(key);
    const spec = id ? model.materials.get(id) : undefined;
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ side: THREE.FrontSide, flatShading: true });
      this.faceMats.set(key, mat);
    }
    mat.color.set(spec?.color ?? DEFAULT_FRONT);
    mat.roughness = spec?.roughness ?? 0.94;
    mat.metalness = spec?.metalness ?? 0;
    mat.opacity = spec?.opacity ?? 1;
    mat.transparent = (spec?.opacity ?? 1) < 1;
    mat.depthWrite = !mat.transparent;
    return mat;
  }

  private clear(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.group.clear();
    this.pickMesh = null;
    this.pickLookup = [];
    this.labels = [];
  }

  build(
    model: Model,
    opts: {
      style: ViewStyle;
      selection: Set<string>;
      selectedEdges: Set<number>;
      selectedAnnotations: Set<string>;
      showHidden: boolean;
      showGuides: boolean;
      unit: Unit;
    },
  ): void {
    this.clear();
    const faces = model.faces();
    const buckets = new Map<string, Bucket>();
    const pickPos: number[] = [];
    const showFaces = opts.style !== 'wireframe';

    for (const face of faces) {
      const t = tessellateFace(model, face);
      if (!t) continue;
      const matId = model.faceMaterials.get(face.key);
      const key = matId ?? '__default';
      let b = buckets.get(key);
      if (!b) {
        b = { pos: [], nor: [], uv: [], idx: [] };
        buckets.set(key, b);
      }
      const base = b.pos.length / 3;
      for (let i = 0; i < t.points.length; i++) {
        const p = t.points[i];
        b.pos.push(p[0], p[1], p[2]);
        b.nor.push(face.normal[0], face.normal[1], face.normal[2]);
        b.uv.push(t.uvs[i][0], t.uvs[i][1]);
      }
      for (const i of t.tris) b.idx.push(base + i);
      for (let i = 0; i < t.tris.length; i += 3) {
        for (const k of [0, 1, 2]) {
          const p = t.points[t.tris[i + k]];
          pickPos.push(p[0], p[1], p[2]);
        }
        this.pickLookup.push(face);
      }
    }

    if (showFaces) {
      for (const [key, b] of buckets) {
        if (!b.idx.length) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
        geo.setIndex(b.idx);
        this.disposables.push(geo);

        const front = this.materialFor(model, key === '__default' ? undefined : key);
        if (opts.style === 'hiddenline') {
          front.color.set(0xffffff);
          front.roughness = 1;
        }
        if (opts.style === 'xray') {
          front.transparent = true;
          front.opacity = 0.34;
          front.depthWrite = false;
        }
        const meshFront = new THREE.Mesh(geo, front);
        meshFront.castShadow = opts.style === 'shaded';
        meshFront.receiveShadow = true;
        this.group.add(meshFront);

        const meshBack = new THREE.Mesh(geo, this.backMat);
        meshBack.castShadow = false;
        meshBack.receiveShadow = true;
        this.group.add(meshBack);
      }
      this.backMat.transparent = opts.style === 'xray';
      this.backMat.opacity = opts.style === 'xray' ? 0.3 : 1;
      this.backMat.depthWrite = opts.style !== 'xray';
    }

    if (pickPos.length) {
      const pickGeo = new THREE.BufferGeometry();
      pickGeo.setAttribute('position', new THREE.Float32BufferAttribute(pickPos, 3));
      this.disposables.push(pickGeo);
      const pickMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
      this.disposables.push(pickMat);
      this.pickMesh = new THREE.Mesh(pickGeo, pickMat);
      this.pickMesh.frustumCulled = false;
      this.group.add(this.pickMesh);
    }

    // ---- edges -------------------------------------------------------------
    const usage = new Map<string, number>();
    for (const f of faces) {
      for (const loop of [f.loop, ...f.holes]) {
        for (let i = 0; i < loop.length; i++) {
          const a = loop[i];
          const b = loop[(i + 1) % loop.length];
          const k = a < b ? `${a}_${b}` : `${b}_${a}`;
          usage.set(k, (usage.get(k) ?? 0) + 1);
        }
      }
    }
    const normal: number[] = [];
    const profile: number[] = [];
    const selected: number[] = [];
    for (const e of model.edges.values()) {
      if (e.smooth && !opts.showHidden) continue;
      const a = model.vertexPos(e.a);
      const b = model.vertexPos(e.b);
      const seg = [a[0], a[1], a[2], b[0], b[1], b[2]];
      if (opts.selectedEdges.has(e.id)) {
        selected.push(...seg);
        continue;
      }
      const k = e.a < e.b ? `${e.a}_${e.b}` : `${e.b}_${e.a}`;
      if ((usage.get(k) ?? 0) < 2) profile.push(...seg);
      else normal.push(...seg);
    }
    this.addLines(normal, this.edgeMat);
    this.addLines(profile, this.profileMat);
    this.addLines(selected, this.selEdgeMat);

    // ---- selection highlight -----------------------------------------------
    if (opts.selection.size) {
      const pos: number[] = [];
      const idx: number[] = [];
      for (const face of faces) {
        if (!opts.selection.has(face.key)) continue;
        const t = tessellateFace(model, face);
        if (!t) continue;
        const base = pos.length / 3;
        for (const p of t.points) pos.push(p[0], p[1], p[2]);
        for (const i of t.tris) idx.push(base + i);
      }
      if (idx.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setIndex(idx);
        this.disposables.push(geo);
        const mesh = new THREE.Mesh(geo, this.selFaceMat);
        mesh.renderOrder = 3;
        this.group.add(mesh);
      }
    }

    // ---- dimensions, notes and guides --------------------------------------
    const notes = buildAnnotations(model, opts.unit, opts.selectedAnnotations, opts.showGuides);
    this.addLines(notes.lines, this.annotationMat);
    this.addLines(notes.guideLines, this.guideMat);
    this.addLines(notes.guidePoints, this.guideMat);
    this.addLines(notes.selectedLines, this.selEdgeMat);
    this.labels = notes.labels;
  }

  private addLines(coords: number[], material: LineMaterial): void {
    if (!coords.length) return;
    const geo = new LineSegmentsGeometry();
    geo.setPositions(coords);
    this.disposables.push(geo);
    const line = new LineSegments2(geo, material);
    line.computeLineDistances();
    line.frustumCulled = false;
    line.renderOrder = 2;
    this.group.add(line);
  }

  /** Face under the ray, if any. */
  raycastFace(raycaster: THREE.Raycaster): { face: Face; point: THREE.Vector3 } | null {
    if (!this.pickMesh) return null;
    const hits = raycaster.intersectObject(this.pickMesh, false);
    if (!hits.length) return null;
    const hit = hits[0];
    const face = this.pickLookup[hit.faceIndex ?? -1];
    if (!face) return null;
    return { face, point: hit.point };
  }

  dispose(): void {
    this.clear();
    for (const m of this.faceMats.values()) m.dispose();
    this.backMat.dispose();
    this.edgeMat.dispose();
    this.profileMat.dispose();
    this.selEdgeMat.dispose();
    this.annotationMat.dispose();
    this.guideMat.dispose();
    this.selFaceMat.dispose();
  }
}
