import { useMemo, useState } from 'react';
import { model, useApp } from '../state/store';
import { formatArea, formatLength, type Unit } from '../core/units';
import { dist3 } from '../core/math';
import type { ViewStyle } from '../viewer/ModelView';
import type { Viewport } from '../viewer/Viewport';

type Tab = 'modelo' | 'materiais' | 'ajustes';

const STYLES: { id: ViewStyle; name: string }[] = [
  { id: 'sombreado', name: 'Sombreado' },
  { id: 'oculta', name: 'Linha oculta' },
  { id: 'linhas', name: 'Só arestas' },
  { id: 'raiox', name: 'Raio-X' },
];

export function RightPanel({ vp, open }: { vp: Viewport | null; open: boolean }) {
  const [tab, setTab] = useState<Tab>('modelo');

  return (
    <aside className={`panel${open ? '' : ' panel--hidden'}`} aria-label="Painel do projeto">
      <div className="panel__tabs" role="tablist">
        {(
          [
            ['modelo', 'Modelo'],
            ['materiais', 'Materiais'],
            ['ajustes', 'Ajustes'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`panel__tab${tab === id ? ' panel__tab--on' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="panel__body">
        {tab === 'modelo' && <ModeloTab />}
        {tab === 'materiais' && <MateriaisTab vp={vp} />}
        {tab === 'ajustes' && <AjustesTab vp={vp} />}
      </div>
    </aside>
  );
}

function ModeloTab() {
  const rev = useApp((s) => s.modelRev);
  const unit = useApp((s) => s.unit);
  const selection = useApp((s) => s.selection);

  const stats = useMemo(() => {
    const faces = model.faces();
    let selArea = 0;
    let selLength = 0;
    let selFaces = 0;
    let selEdges = 0;
    for (const ref of selection) {
      if (ref.kind === 'face') {
        const f = faces.find((x) => x.key === ref.key);
        if (f) {
          selArea += f.area;
          selFaces++;
        }
      } else if (ref.kind === 'edge') {
        const e = model.edges.get(ref.id);
        if (e) {
          const [a, b] = model.edgePoints(e.id);
          selLength += dist3(a, b);
          selEdges++;
        }
      }
    }
    const b = model.bounds();
    return {
      faces: faces.length,
      edges: model.edges.size,
      vertices: model.vertices.size,
      area: faces.reduce((s, f) => s + f.area, 0),
      cotas: model.dimensions.size,
      textos: model.notes.size,
      guias: model.guides.size,
      selArea,
      selLength,
      selFaces,
      selEdges,
      size: b ? ([b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]] as const) : null,
    };
    // rev entra de propósito: o modelo muda fora do React
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev, selection]);

  return (
    <>
      <section>
        <h2 className="group__title">Seleção</h2>
        {stats.selFaces || stats.selEdges ? (
          <dl className="readout">
            <dt>Faces</dt>
            <dd>{stats.selFaces}</dd>
            <dt>Arestas</dt>
            <dd>{stats.selEdges}</dd>
            <dt>Área</dt>
            <dd>{formatArea(stats.selArea, unit)}</dd>
            <dt>Comprimento</dt>
            <dd>{formatLength(stats.selLength, unit)}</dd>
          </dl>
        ) : (
          <p className="material-name">Nada selecionado. Use a seta e clique numa face ou aresta.</p>
        )}
      </section>

      <section>
        <h2 className="group__title">Modelo</h2>
        <dl className="readout">
          <dt>Faces</dt>
          <dd>{stats.faces}</dd>
          <dt>Arestas</dt>
          <dd>{stats.edges}</dd>
          <dt>Vértices</dt>
          <dd>{stats.vertices}</dd>
          <dt>Área total</dt>
          <dd>{formatArea(stats.area, unit)}</dd>
        </dl>
      </section>

      <section>
        <h2 className="group__title">Anotações</h2>
        <dl className="readout">
          <dt>Cotas</dt>
          <dd>{stats.cotas}</dd>
          <dt>Textos</dt>
          <dd>{stats.textos}</dd>
          <dt>Guias</dt>
          <dd>{stats.guias}</dd>
        </dl>
      </section>

      {stats.size && (
        <section>
          <h2 className="group__title">Envoltória</h2>
          <dl className="readout">
            <dt>Largura X</dt>
            <dd>{formatLength(stats.size[0], unit)}</dd>
            <dt>Profundidade Y</dt>
            <dd>{formatLength(stats.size[1], unit)}</dd>
            <dt>Altura Z</dt>
            <dd>{formatLength(stats.size[2], unit)}</dd>
          </dl>
        </section>
      )}
    </>
  );
}

function MateriaisTab({ vp }: { vp: Viewport | null }) {
  const active = useApp((s) => s.activeMaterial);
  const setActive = useApp((s) => s.setActiveMaterial);
  const selection = useApp((s) => s.selection);
  const commit = useApp((s) => s.commit);
  const setTool = useApp((s) => s.setTool);
  const rev = useApp((s) => s.modelRev);
  const [color, setColor] = useState('#c86a3b');
  const [name, setName] = useState('');

  // rev entra de propósito: a paleta vive no modelo, fora do React
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const materials = useMemo(() => [...model.materials.values()], [rev]);
  const groups = useMemo(() => {
    const map = new Map<string, typeof materials>();
    for (const m of materials) map.set(m.group, [...(map.get(m.group) ?? []), m]);
    return [...map.entries()];
  }, [materials]);

  const applyTo = (id: string | null) => {
    setActive(id);
    const faces = selection.filter((r) => r.kind === 'face');
    if (faces.length) {
      for (const ref of faces) if (ref.kind === 'face') model.applyMaterial(ref.key, id);
      vp?.refreshModel();
      commit('Pintar seleção');
    } else {
      setTool('pintar');
    }
  };

  const activeSpec = active ? model.materials.get(active) : undefined;
  const activeName = activeSpec?.name ?? 'Sem material';

  return (
    <>
      <section>
        <h2 className="group__title">Ativo</h2>
        <div className="active-material">
          <span
            className={activeSpec ? 'swatch' : 'swatch swatch--none'}
            style={activeSpec ? { background: activeSpec.color } : undefined}
            aria-hidden="true"
          />
          <div>
            <p className="material-name">{activeName}</p>
            {active !== null && (
              <button type="button" className="linkish" onClick={() => applyTo(null)}>
                Tirar o material
              </button>
            )}
          </div>
        </div>
      </section>

      {groups.map(([group, list]) => (
        <section key={group}>
          <h2 className="group__title">{group}</h2>
          <div className="swatches">
            {list.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`swatch${active === m.id ? ' swatch--on' : ''}`}
                style={{ background: m.color, opacity: m.opacity < 1 ? 0.75 : 1 }}
                onClick={() => applyTo(m.id)}
                title={m.name}
                aria-label={m.name}
              />
            ))}
          </div>
        </section>
      ))}

      <section>
        <h2 className="group__title">Novo material</h2>
        <div className="field">
          <label htmlFor="mat-cor">Cor</label>
          <input id="mat-cor" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="mat-nome">Nome</label>
          <input
            id="mat-nome"
            type="text"
            value={name}
            placeholder="Ex.: madeira clara"
            onChange={(e) => setName(e.target.value)}
            style={{ minWidth: 120 }}
          />
        </div>
        <div className="segmented" style={{ gridTemplateColumns: '1fr' }}>
          <button
            type="button"
            onClick={() => {
              const id = `custom-${Date.now().toString(36)}`;
              model.materials.set(id, {
                id,
                name: name.trim() || 'Material sem nome',
                color,
                opacity: 1,
                roughness: 0.85,
                metalness: 0,
                group: 'Meus materiais',
              });
              model.revision++;
              setName('');
              applyTo(id);
              commit('Novo material');
            }}
          >
            Adicionar à paleta
          </button>
        </div>
      </section>
    </>
  );
}

function AjustesTab({ vp }: { vp: Viewport | null }) {
  const style = useApp((s) => s.style);
  const setStyle = useApp((s) => s.setStyle);
  const unit = useApp((s) => s.unit);
  const setUnit = useApp((s) => s.setUnit);
  const sides = useApp((s) => s.polygonSides);
  const setSides = useApp((s) => s.setPolygonSides);
  const showGrid = useApp((s) => s.showGrid);
  const showShadows = useApp((s) => s.showShadows);
  const showHidden = useApp((s) => s.showHidden);
  const showGuides = useApp((s) => s.showGuides);
  const toggle = useApp((s) => s.toggle);
  const commit = useApp((s) => s.commit);

  return (
    <>
      <section>
        <h2 className="group__title">Estilo da vista</h2>
        <div className="segmented">
          {STYLES.map((s) => (
            <button key={s.id} type="button" className={style === s.id ? 'on' : ''} onClick={() => setStyle(s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="group__title">Exibição</h2>
        <label className="check">
          <input type="checkbox" checked={showGrid} onChange={() => toggle('showGrid')} />
          Grade e eixos
        </label>
        <label className="check">
          <input type="checkbox" checked={showShadows} onChange={() => toggle('showShadows')} />
          Sombras do sol
        </label>
        <label className="check">
          <input type="checkbox" checked={showHidden} onChange={() => toggle('showHidden')} />
          Mostrar arestas suavizadas
        </label>
        <label className="check">
          <input type="checkbox" checked={showGuides} onChange={() => toggle('showGuides')} />
          Mostrar guias
        </label>
        <div className="segmented" style={{ gridTemplateColumns: '1fr', marginTop: 8 }}>
          <button
            type="button"
            onClick={() => {
              model.clearGuides();
              vp?.refreshModel();
              commit('Apagar guias');
            }}
          >
            Apagar todas as guias
          </button>
        </div>
      </section>

      <section>
        <h2 className="group__title">Medidas</h2>
        <div className="field">
          <label htmlFor="unidade">Unidade</label>
          <select id="unidade" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            <option value="m">metros</option>
            <option value="cm">centímetros</option>
            <option value="mm">milímetros</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="lados">Lados do polígono</label>
          <input
            id="lados"
            type="number"
            min={3}
            max={64}
            value={sides}
            onChange={(e) => setSides(Number(e.target.value))}
          />
        </div>
      </section>

      <section>
        <h2 className="group__title">Como navegar</h2>
        <ul className="hintlist">
          <li>
            <kbd>botão do meio</kbd> <span>Orbitar</span>
          </li>
          <li>
            <kbd>shift + meio</kbd> <span>Deslocar a vista</span>
          </li>
          <li>
            <kbd>botão direito</kbd> <span>Deslocar a vista</span>
          </li>
          <li>
            <kbd>roda</kbd> <span>Zoom no ponto do cursor</span>
          </li>
          <li>
            <kbd>setas</kbd> <span>Travar no eixo X, Y ou Z</span>
          </li>
          <li>
            <kbd>digitar</kbd> <span>Vai direto para a caixa de medidas</span>
          </li>
          <li>
            <kbd>Ctrl Z</kbd> <span>Desfazer</span>
          </li>
          <li>
            <kbd>Del</kbd> <span>Apagar a seleção</span>
          </li>
        </ul>
      </section>
    </>
  );
}
