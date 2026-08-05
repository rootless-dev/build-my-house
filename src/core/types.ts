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
  /** Aresta suave: escondida no render, mas ainda define geometria. */
  smooth?: boolean;
}

/**
 * Faces não são armazenadas: elas são *derivadas* do grafo de arestas a cada
 * alteração topológica, como no SketchUp. Fechar um laço cria a face; apagar
 * uma aresta funde as faces vizinhas; desenhar dentro de uma face a divide.
 */
export interface Face {
  /** Chave estável derivada dos vértices do contorno — persiste material/estado. */
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
  /** Grupo para agrupar na paleta da interface. */
  group: string;
}

/**
 * Âncora de anotação. Guarda sempre a posição, e o vértice quando existir —
 * assim a cota acompanha a geometria ao ser movida, mas sobrevive se o vértice
 * for apagado.
 */
export interface Anchor {
  v?: ID;
  p: Vec3;
}

/** Cota: a medida marcada no modelo, com linhas de chamada e etiqueta. */
export interface Dimension {
  id: ID;
  a: Anchor;
  b: Anchor;
  /** Deslocamento da linha de cota em relação ao segmento medido. */
  offset: Vec3;
}

/** Texto com linha de chamada, preso a um ponto do modelo. */
export interface Note {
  id: ID;
  anchor: Anchor;
  offset: Vec3;
  text: string;
}

/** Geometria de construção: linha-guia (com `dir`) ou ponto-guia. */
export interface Guide {
  id: ID;
  p: Vec3;
  dir: Vec3 | null;
}

export type EntityRef =
  | { kind: 'vertex'; id: ID }
  | { kind: 'edge'; id: ID }
  | { kind: 'face'; key: string }
  | { kind: 'cota'; id: ID }
  | { kind: 'texto'; id: ID }
  | { kind: 'guia'; id: ID };

export interface ModelSnapshot {
  version: 1 | 2;
  vertices: [ID, Vec3][];
  edges: [ID, ID, ID, 0 | 1][];
  suppressed: string[];
  faceMaterials: [string, string][];
  materials: Material[];
  nextId: number;
  /** A partir da versão 2. */
  dimensions?: Dimension[];
  notes?: Note[];
  guides?: Guide[];
}
