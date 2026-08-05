/* Verificação rápida do núcleo geométrico, executada sob demanda no console. */
import { Model } from './model';
import type { Vec3 } from './math';

interface Case {
  nome: string;
  esperado: string;
  obtido: string;
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
  const check = (nome: string, esperado: unknown, obtido: unknown) =>
    out.push({ nome, esperado: String(esperado), obtido: String(obtido), ok: String(esperado) === String(obtido) });

  // 1. retângulo fechado vira uma face
  {
    const m = new Model();
    rect(m, 0, 0, 4, 3);
    check('retângulo → 1 face', 1, m.faces().length);
    check('retângulo → área 12 m²', '12.00', m.faces()[0]?.area.toFixed(2));
  }

  // 2. push/pull cria uma caixa de 6 faces
  {
    const m = new Model();
    rect(m, 0, 0, 4, 3);
    m.pushPull(m.faces()[0], 2.5);
    check('caixa → 6 faces', 6, m.faces().length);
    check('caixa → 12 arestas', 12, m.edges.size);
  }

  // 3. push/pull de novo estica em vez de duplicar geometria
  {
    const m = new Model();
    rect(m, 0, 0, 4, 3);
    m.pushPull(m.faces()[0], 2);
    const topo = m.faces().find((f) => f.normal[2] > 0.9 && f.center[2] > 1)!;
    const modo = m.pushPull(topo, 1).mode;
    check('segundo push/pull → estica', 'stretch', modo);
    check('ainda 6 faces', 6, m.faces().length);
    check('altura final 3 m', 3, m.bounds()!.max[2]);
  }

  // 4. retângulo dentro de retângulo → face com furo + face interna
  {
    const m = new Model();
    rect(m, 0, 0, 6, 4);
    rect(m, 1, 1, 3, 3);
    const faces = m.faces();
    check('divisão → 2 faces', 2, faces.length);
    const comFuro = faces.find((f) => f.holes.length === 1);
    check('face externa tem 1 furo', true, Boolean(comFuro));
    check('área da face externa 20 m²', '20.00', comFuro?.area.toFixed(2));
  }

  // 5. aresta cruzando outra é quebrada no cruzamento
  {
    const m = new Model();
    m.addSegment([0, 0, 0], [4, 0, 0]);
    m.addSegment([2, -2, 0], [2, 2, 0]);
    check('cruzamento → 4 arestas', 4, m.edges.size);
    check('cruzamento → 5 vértices', 5, m.vertices.size);
  }

  // 6. apagar uma aresta funde as faces vizinhas
  {
    const m = new Model();
    rect(m, 0, 0, 4, 2);
    m.addSegment([2, 0, 0], [2, 2, 0]);
    check('divisão por linha → 2 faces', 2, m.faces().length);
    const divisor = [...m.edges.values()].find((e) => {
      const [a, b] = m.edgePoints(e.id);
      return a[0] === 2 && b[0] === 2;
    })!;
    m.deleteEdge(divisor.id);
    check('apagar divisor → 1 face', 1, m.faces().length);
  }

  // 7. vão vazado: retângulo na parede empurrado até o outro lado
  {
    const m = new Model();
    rect(m, 0, 0, 4, 3);
    m.pushPull(m.faces()[0], 0.2); // parede de 20 cm deitada
    const frente = m.faces().find((f) => Math.abs(f.normal[2] - 1) < 0.01 && f.center[2] > 0.1)!;
    m.addPolyline(
      [
        [1, 1, 0.2],
        [2, 1, 0.2],
        [2, 2, 0.2],
        [1, 2, 0.2],
      ] as Vec3[],
      true,
    );
    const vao = m.faces().find((f) => Math.abs(f.area - 1) < 0.01 && f.center[2] > 0.1)!;
    check('parede dividida', true, Boolean(frente) && Boolean(vao));
    const r = m.pushPull(vao, -0.2);
    check('push/pull atravessou', true, r.cut);
    const restou = m.faces().some((f) => Math.abs(f.area - 1) < 0.01 && Math.abs(f.normal[2]) > 0.9);
    check('vão aberto (sem tampas)', false, restou);
  }

  // 8. a cota gruda no vértice e acompanha quando a geometria se move
  {
    const m = new Model();
    rect(m, 0, 0, 4, 3);
    const cantos = [...m.vertices.values()];
    const a = cantos.find((v) => v.p[0] === 0 && v.p[1] === 0)!;
    const b = cantos.find((v) => v.p[0] === 4 && v.p[1] === 0)!;
    m.addDimension(m.makeAnchor(a.p, a.id), m.makeAnchor(b.p, b.id), [0, -1, 0]);
    const cota = [...m.dimensions.values()][0];
    check('cota mede 4 m', 4, dist(m.anchorPoint(cota.a), m.anchorPoint(cota.b)));
    m.translateVertices([b.id], [2, 0, 0]);
    check('cota acompanha o vértice', 6, dist(m.anchorPoint(cota.a), m.anchorPoint(cota.b)));
  }

  // 9. anotações sobrevivem ao salvar e abrir
  {
    const m = new Model();
    rect(m, 0, 0, 2, 2);
    m.addDimension(m.makeAnchor([0, 0, 0]), m.makeAnchor([2, 0, 0]), [0, -1, 0]);
    m.addNote(m.makeAnchor([1, 1, 0]), [0, 0, 1], 'sala');
    m.addGuide([0, 1, 0], [1, 0, 0]);
    const copia = new Model();
    copia.loadSnapshot(JSON.parse(JSON.stringify(m.toSnapshot())));
    check('cotas salvas', 1, copia.dimensions.size);
    check('textos salvos', 'sala', [...copia.notes.values()][0]?.text);
    check('guias salvas', 1, copia.guides.size);
    check('faces preservadas', 1, copia.faces().length);
  }

  // 10. arquivo da versão 1 (sem anotações) ainda abre
  {
    const m = new Model();
    rect(m, 0, 0, 3, 3);
    const antigo = { ...m.toSnapshot(), version: 1 as const };
    delete (antigo as { dimensions?: unknown }).dimensions;
    delete (antigo as { notes?: unknown }).notes;
    delete (antigo as { guides?: unknown }).guides;
    const copia = new Model();
    copia.loadSnapshot(antigo);
    check('projeto v1 abre', 1, copia.faces().length);
    check('projeto v1 sem cotas', 0, copia.dimensions.size);
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
