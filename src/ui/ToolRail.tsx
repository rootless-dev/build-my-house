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
  [{ id: 'select', name: 'Selecionar', key: 'Espaço' }],
  [
    { id: 'line', name: 'Linha', key: 'L' },
    { id: 'rectangle', name: 'Retângulo', key: 'R' },
    { id: 'circle', name: 'Círculo', key: 'C' },
    { id: 'polygon', name: 'Polígono', key: 'G' },
    { id: 'arc', name: 'Arco', key: 'A' },
  ],
  [
    { id: 'pushpull', name: 'Empurrar/Puxar', key: 'P' },
    { id: 'offset', name: 'Deslocar', key: 'F' },
    { id: 'move', name: 'Mover', key: 'M' },
    { id: 'rotate', name: 'Girar', key: 'Q' },
    { id: 'scale', name: 'Escala', key: 'S' },
  ],
  [
    { id: 'eraser', name: 'Borracha', key: 'E' },
    { id: 'paint', name: 'Pintar', key: 'B' },
  ],
  [
    { id: 'tape', name: 'Trena e guias', key: 'T' },
    { id: 'dimension', name: 'Cota', key: 'D' },
    { id: 'text', name: 'Texto', key: 'X' },
  ],
  [
    { id: 'orbit', name: 'Orbitar', key: 'O' },
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
  // The rail scrolls, and a bubble inside it would be clipped by the overflow.
  // So the tip goes into a portal, positioned in viewport coordinates.
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
    // Anchor to the rail edge, not the button's: the button has side padding and
    // the tip would sit on top of the divider.
    const railEdge = railRef.current?.getBoundingClientRect().right ?? r.right;
    setTip({ name: entry.name, key: entry.key, top: r.top + r.height / 2, left: railEdge + 10 });
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
