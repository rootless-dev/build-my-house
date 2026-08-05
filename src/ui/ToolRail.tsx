import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../state/store';
import type { ToolId } from '../tools/base';
import { ToolIcon } from './icons';

interface Entry {
  id: ToolId;
  name: string;
  key: string;
}

const GROUPS: Entry[][] = [
  [{ id: 'selecionar', name: 'Selecionar', key: 'Espaço' }],
  [
    { id: 'linha', name: 'Linha', key: 'L' },
    { id: 'retangulo', name: 'Retângulo', key: 'R' },
    { id: 'circulo', name: 'Círculo', key: 'C' },
    { id: 'poligono', name: 'Polígono', key: 'G' },
    { id: 'arco', name: 'Arco', key: 'A' },
  ],
  [
    { id: 'empurrar', name: 'Empurrar/Puxar', key: 'P' },
    { id: 'deslocar', name: 'Deslocar', key: 'F' },
    { id: 'mover', name: 'Mover', key: 'M' },
    { id: 'girar', name: 'Girar', key: 'Q' },
    { id: 'escala', name: 'Escala', key: 'S' },
  ],
  [
    { id: 'borracha', name: 'Borracha', key: 'E' },
    { id: 'pintar', name: 'Pintar', key: 'B' },
  ],
  [
    { id: 'trena', name: 'Trena e guias', key: 'T' },
    { id: 'cotar', name: 'Cota', key: 'D' },
    { id: 'texto', name: 'Texto', key: 'X' },
  ],
  [
    { id: 'orbitar', name: 'Orbitar', key: 'O' },
    { id: 'pan', name: 'Deslocar vista', key: 'H' },
  ],
];

interface Tip {
  name: string;
  key: string;
  top: number;
  left: number;
}

export function ToolRail() {
  const tool = useApp((s) => s.tool);
  const setTool = useApp((s) => s.setTool);
  // O rail rola, e um balão dentro dele seria cortado pelo overflow. Por isso
  // a dica sai num portal, posicionada em coordenadas de viewport.
  const [tip, setTip] = useState<Tip | null>(null);
  const railRef = useRef<HTMLElement>(null);

  const hide = useCallback(() => setTip(null), []);

  useEffect(() => {
    if (!tip) return;
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [tip, hide]);

  const show = (el: HTMLElement, entry: Entry) => {
    const r = el.getBoundingClientRect();
    // Encosta na borda do rail, não na do botão: o botão tem folga lateral e a
    // dica ficaria por cima da divisória.
    const borda = railRef.current?.getBoundingClientRect().right ?? r.right;
    setTip({ name: entry.name, key: entry.key, top: r.top + r.height / 2, left: borda + 10 });
  };

  return (
    <>
      <nav className="rail" aria-label="Ferramentas" onScroll={hide} ref={railRef}>
        {GROUPS.map((group, gi) => (
          <div key={gi} style={{ display: 'contents' }}>
            {gi > 0 && <div className="rail__sep" />}
            {group.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`tool${tool === entry.id ? ' tool--active' : ''}`}
                onClick={() => setTool(entry.id)}
                onPointerEnter={(e) => {
                  if (e.pointerType !== 'touch') show(e.currentTarget, entry);
                }}
                onPointerLeave={hide}
                onFocus={(e) => show(e.currentTarget, entry)}
                onBlur={hide}
                aria-pressed={tool === entry.id}
                aria-label={`${entry.name} (${entry.key})`}
                aria-keyshortcuts={entry.key}
              >
                {ToolIcon[entry.id]}
              </button>
            ))}
          </div>
        ))}
      </nav>
      {tip &&
        createPortal(
          <div className="tool-tip" role="tooltip" style={{ top: tip.top, left: tip.left }}>
            {tip.name}
            <span className="tool-tip__key">({tip.key})</span>
          </div>,
          document.body,
        )}
    </>
  );
}
