import { useRef } from 'react';
import { model, useApp } from '../state/store';
import { download, exportJSON, exportOBJ, exportSTL, parseJSON } from '../core/io';
import { UiIcon } from './icons';
import type { Viewport } from '../viewer/Viewport';

export function TopBar({ vp, panelOpen, onTogglePanel }: { vp: Viewport | null; panelOpen: boolean; onTogglePanel: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const name = useApp((s) => s.projectName);
  const setName = useApp((s) => s.setProjectName);
  const undoStack = useApp((s) => s.undoStack);
  const redoStack = useApp((s) => s.redoStack);
  const undo = useApp((s) => s.undo);
  const redo = useApp((s) => s.redo);
  const reset = useApp((s) => s.resetProject);
  const loadSnapshot = useApp((s) => s.loadSnapshot);
  const pushToast = useApp((s) => s.pushToast);

  const safeName = name.trim().replace(/\s+/g, '-').toLowerCase() || 'casa';

  const openFile = async (file: File) => {
    try {
      const snap = parseJSON(await file.text());
      loadSnapshot(snap, file.name.replace(/\.(casa|json)$/i, ''));
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Não deu para ler esse arquivo.');
    }
  };

  return (
    <header className="topbar">
      <div className="topbar__brand">
        {/* Em telas estreitas a marca encolhe para a sigla. */}
        <span className="topbar__mark topbar__mark--full">
          Build <span className="topbar__mark-weak">my</span> House
        </span>
        <span className="topbar__mark topbar__mark--short">BmH</span>
        <span className="topbar__sub">modelagem 3d</span>
      </div>

      <input
        className="topbar__name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Nome do projeto"
        spellCheck={false}
      />

      <div className="topbar__group">
        <button
          type="button"
          className="tbtn"
          onClick={() => {
            reset();
            vp?.refreshModel();
            vp?.zoomExtents();
          }}
        >
          {UiIcon.novo}
          <span>Novo</span>
        </button>
        <button type="button" className="tbtn" onClick={() => fileRef.current?.click()}>
          {UiIcon.abrir}
          <span>Abrir</span>
        </button>
        <button
          type="button"
          className="tbtn"
          onClick={() => download(`${safeName}.casa`, exportJSON(model), 'application/json')}
        >
          {UiIcon.salvar}
          <span>Salvar</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".casa,.json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void openFile(file);
            e.target.value = '';
          }}
        />
      </div>

      <div className="topbar__group">
        <button type="button" className="tbtn" onClick={() => download(`${safeName}.obj`, exportOBJ(model, safeName))}>
          {UiIcon.exportar}
          <span>OBJ</span>
        </button>
        <button type="button" className="tbtn" onClick={() => download(`${safeName}.stl`, exportSTL(model, safeName))}>
          {UiIcon.exportar}
          <span>STL</span>
        </button>
      </div>

      <div className="topbar__group">
        <button
          type="button"
          className="tbtn tbtn--icon"
          onClick={() => {
            undo();
            vp?.refreshModel();
          }}
          disabled={!undoStack.length}
          title={undoStack.length ? `Desfazer ${undoStack[undoStack.length - 1].label}` : 'Nada a desfazer'}
          aria-label="Desfazer"
        >
          {UiIcon.desfazer}
        </button>
        <button
          type="button"
          className="tbtn tbtn--icon"
          onClick={() => {
            redo();
            vp?.refreshModel();
          }}
          disabled={!redoStack.length}
          title={redoStack.length ? `Refazer ${redoStack[redoStack.length - 1].label}` : 'Nada a refazer'}
          aria-label="Refazer"
        >
          {UiIcon.refazer}
        </button>
      </div>

      <div className="topbar__spacer" />

      <div className="topbar__group">
        {(['iso', 'topo', 'frente', 'direita'] as const).map((view) => (
          <button key={view} type="button" className="tbtn" onClick={() => vp?.setStandardView(view)}>
            <span>{view}</span>
          </button>
        ))}
        <button type="button" className="tbtn tbtn--icon" onClick={() => vp?.zoomExtents()} title="Enquadrar tudo" aria-label="Enquadrar tudo">
          {UiIcon.enquadrar}
        </button>
      </div>

      <div className="topbar__group">
        <button
          type="button"
          className={`tbtn tbtn--icon${panelOpen ? ' tbtn--on' : ''}`}
          onClick={onTogglePanel}
          aria-label="Mostrar ou esconder o painel"
          aria-pressed={panelOpen}
        >
          {UiIcon.painel}
        </button>
      </div>
    </header>
  );
}
