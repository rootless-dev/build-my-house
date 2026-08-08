import type { Vec3 } from './math';

export type ID = number;

export interface Vertex {
  id: ID;
  p: Vec3;
}

export interface Edge {
  id: ID;
  a: ID;
  b: ID;
  /** Soft edge: hidden when rendering, but still defines geometry. */
  smooth?: boolean;
}

/**
 * Faces are not stored: they are *derived* from the edge graph on every
 * topological change, as in SketchUp. Closing a loop creates the face;
 * deleting an edge merges the neighbours; drawing inside a face splits it.
 */
export interface Face {
  /** Stable key derived from the outline vertices — keeps material and state. */
  key: string;
  loop: ID[];
  holes: ID[][];
  normal: Vec3;
  center: Vec3;
  area: number;
}

export interface Material {
  id: string;
  name: string;
  color: string;
  opacity: number;
  roughness: number;
  metalness: number;
  /** Bucket used to group the material in the interface palette. */
  group: string;
}

/**
 * Annotation anchor. Always stores the position, and the vertex when there is
 * one — so the dimension follows the geometry as it moves, but survives the
 * vertex being deleted.
 */
export interface Anchor {
  v?: ID;
  p: Vec3;
}

/** Dimension: a measurement marked on the model, with witness lines and label. */
export interface Dimension {
  id: ID;
  a: Anchor;
  b: Anchor;
  /** Offset of the dimension line relative to the measured segment. */
  offset: Vec3;
}

/** Text with a leader line, pinned to a point of the model. */
export interface Note {
  id: ID;
  anchor: Anchor;
  offset: Vec3;
  text: string;
}

/** Construction geometry: guide line (with `dir`) or guide point. */
export interface Guide {
  id: ID;
  p: Vec3;
  dir: Vec3 | null;
}

export type EntityRef =
  | { kind: 'vertex'; id: ID }
  | { kind: 'edge'; id: ID }
  | { kind: 'face'; key: string }
  | { kind: 'dimension'; id: ID }
  | { kind: 'note'; id: ID }
  | { kind: 'guide'; id: ID };

export interface ModelSnapshot {
  version: 1 | 2;
  vertices: [ID, Vec3][];
  edges: [ID, ID, ID, 0 | 1][];
  suppressed: string[];
  faceMaterials: [string, string][];
  materials: Material[];
  nextId: number;
  /** Version 2 onwards. */
  dimensions?: Dimension[];
  notes?: Note[];
  guides?: Guide[];
}
