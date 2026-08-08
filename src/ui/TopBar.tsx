import { model, useApp } from '../state/store';
import { download, exportJSON } from '../core/io';
import { exportOBJ, exportSTL } from '../core/mesh-export';
import { saveCurrentProject } from '../storage/save';
import { agoText, slug } from './format';
import { UiIcon } from './icons';
import type { Viewport } from '../viewer/Viewport';
import type { StandardView } from '../viewer/CameraRig';

/** Camera presets offered in the bar, with their pt-BR labels. */
const STANDARD_VIEWS: [StandardView, string][] = [
  ['iso', 'iso'],
  ['top', 'topo'],
  ['front', 'frente'],
  ['right', 'direita'],
];

const SAVE_TEXT: Record<string, string> = {
  saving: 'salvando…',
  dirty: 'alterações não salvas',
  error: 'falha ao salvar',
};

export function TopBar({
  vp,
  panelOpen,
  onTogglePanel,
  onExit,
}: {
  vp: Viewport | null;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onExit: () => void;
}) {
  const name = useApp((s) => s.projectName);
  const setName = useApp((s) => s.setProjectName);
  const undoStack = useApp((s) => s.undoStack);
  const redoStack = useApp((s) => s.redoStack);
  const undo = useApp((s) => s.undo);
  const redo = useApp((s) => s.redo);
  const saveState = useApp((s) => s.saveState);
  const lastSavedAt = useApp((s) => s.lastSavedAt);

  const safeName = slug(name);
  const saveText =
    SAVE_TEXT[saveState] ?? (lastSavedAt ? `salvo ${agoText(lastSavedAt)}` : 'ainda não salvo');

  return (
    <header className="topbar">
      <div className="topbar__brand">
        {/* On narrow screens the wordmark shrinks to the initials. */}
        <span className="topbar__mark topbar__mark--full">
          Build <span className="topbar__mark-weak">my</span> House
        </span>
        <span className="topbar__mark topbar__mark--short">BmH</span>
        <span className="topbar__sub">modelagem 3d</span>
      </div>

      <div className="topbar__project">
        <input
          className="topbar__name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nome do projeto"
          spellCheck={false}
        />
        <span className={`topbar__save topbar__save--${saveState}`}>{saveText}</span>
      </div>

      <div className="topbar__group">
        <button type="button" className="tbtn" onClick={onExit} title="Voltar para a lista de projetos">
          {UiIcon.menu}
          <span>Projetos</span>
        </button>
        <button
          type="button"
          className="tbtn"
          onClick={() => void saveCurrentProject(vp, { thumbnail: true })}
          disabled={saveState === 'saving'}
          title="Gravar na biblioteca do navegador"
        >
          {UiIcon.save}
          <span>Salvar</span>
        </button>
      </div>

      <div className="topbar__group">
        <button
          type="button"
          className="tbtn"
          onClick={() => download(`${safeName}.casa`, exportJSON(model), 'application/json')}
          title="Baixar uma cópia em arquivo"
        >
          {UiIcon.export}
          <span>.casa</span>
        </button>
        <button type="button" className="tbtn" onClick={() => download(`${safeName}.obj`, exportOBJ(model, safeName))}>
          {UiIcon.export}
          <span>OBJ</span>
        </button>
        <button type="button" className="tbtn" onClick={() => download(`${safeName}.stl`, exportSTL(model, safeName))}>
          {UiIcon.export}
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
          {UiIcon.undo}
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
          {UiIcon.redo}
        </button>
      </div>

      <div className="topbar__spacer" />

      <div className="topbar__group">
        {STANDARD_VIEWS.map(([view, label]) => (
          <button key={view} type="button" className="tbtn" onClick={() => vp?.setStandardView(view)}>
            <span>{label}</span>
          </button>
        ))}
        <button type="button" className="tbtn tbtn--icon" onClick={() => vp?.zoomExtents()} title="Enquadrar tudo" aria-label="Enquadrar tudo">
          {UiIcon.zoomExtents}
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
          {UiIcon.panel}
        </button>
      </div>
    </header>
  );
}
