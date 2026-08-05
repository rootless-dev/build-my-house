import { create } from 'zustand';
import { Model } from '../core/model';
import type { EntityRef, ModelSnapshot } from '../core/types';
import type { ToolId } from '../tools/base';
import type { ViewStyle } from '../viewer/ModelView';
import type { Unit } from '../core/units';

/** Single model instance. Mutated outside React — the store only notifies the UI. */
export const model = new Model();

const HISTORY_LIMIT = 80;

export interface Toast {
  id: number;
  text: string;
}

export type SaveState = 'clean' | 'dirty' | 'saving' | 'error';

interface AppState {
  tool: ToolId;
  selection: EntityRef[];
  activeMaterial: string | null;
  unit: Unit;
  polygonSides: number;
  style: ViewStyle;
  showHidden: boolean;
  showGrid: boolean;
  showShadows: boolean;
  showGuides: boolean;
  status: string;
  measureValue: string;
  measureHint: string;
  toast: Toast | null;
  /** Bumped on every committed operation — model consumers watch this. */
  modelRev: number;
  /** Bumped when the whole model is swapped (new, open, undo). */
  epoch: number;
  undoStack: { label: string; snap: ModelSnapshot }[];
  redoStack: { label: string; snap: ModelSnapshot }[];
  baseline: ModelSnapshot;
  projectName: string;
  /** Id in the local library; null until the project has been written. */
  projectId: string | null;
  saveState: SaveState;
  lastSavedAt: number | null;
  /** `modelRev` at the last save — the gap is what still needs writing. */
  savedRev: number;

  setTool: (id: ToolId) => void;
  setSelection: (refs: EntityRef[]) => void;
  setActiveMaterial: (id: string | null) => void;
  setUnit: (u: Unit) => void;
  setPolygonSides: (n: number) => void;
  setStyle: (s: ViewStyle) => void;
  toggle: (key: 'showHidden' | 'showGrid' | 'showShadows' | 'showGuides') => void;
  setStatus: (text: string) => void;
  setMeasure: (value: string, hint: string) => void;
  pushToast: (text: string) => void;
  commit: (label: string) => void;
  touch: () => void;
  undo: () => void;
  redo: () => void;
  resetProject: () => void;
  loadSnapshot: (snap: ModelSnapshot, name: string) => void;
  openProject: (snap: ModelSnapshot, name: string, id: string | null) => void;
  setProjectName: (name: string) => void;
  setSaveState: (state: SaveState) => void;
  /** `rev` is the `modelRev` captured when the write started. */
  markSaved: (id: string, at: number, rev: number) => void;
}

let toastId = 0;

export const useApp = create<AppState>((set, get) => ({
  tool: 'line',
  selection: [],
  activeMaterial: null,
  unit: 'm',
  polygonSides: 6,
  style: 'shaded',
  showHidden: false,
  showGrid: true,
  showShadows: true,
  showGuides: true,
  status: 'Clique para começar a linha.',
  measureValue: '',
  measureHint: '',
  toast: null,
  modelRev: 0,
  epoch: 0,
  undoStack: [],
  redoStack: [],
  baseline: model.toSnapshot(),
  projectName: 'Casa sem nome',
  projectId: null,
  saveState: 'clean',
  lastSavedAt: null,
  savedRev: 0,

  setTool: (id) => set({ tool: id }),
  setSelection: (refs) => set({ selection: refs, modelRev: get().modelRev + 1 }),
  setActiveMaterial: (id) => set({ activeMaterial: id }),
  setUnit: (unit) => set((s) => ({ unit, modelRev: s.modelRev + 1 })),
  setPolygonSides: (polygonSides) => set({ polygonSides: Math.max(3, Math.min(64, polygonSides)) }),
  setStyle: (style) => set({ style, modelRev: get().modelRev + 1 }),
  toggle: (key) => set((s) => ({ [key]: !s[key], modelRev: s.modelRev + 1 }) as Partial<AppState>),
  setStatus: (status) => set({ status }),
  setMeasure: (measureValue, measureHint) => set({ measureValue, measureHint }),
  pushToast: (text) => set({ toast: { id: ++toastId, text } }),

  commit: (label) => {
    const { undoStack, baseline, modelRev } = get();
    const next = [...undoStack, { label, snap: baseline }];
    if (next.length > HISTORY_LIMIT) next.shift();
    set({
      undoStack: next,
      redoStack: [],
      baseline: model.toSnapshot(),
      modelRev: modelRev + 1,
      saveState: 'dirty',
    });
  },

  touch: () => set((s) => ({ modelRev: s.modelRev + 1 })),

  undo: () => {
    const { undoStack, redoStack } = get();
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    const current = model.toSnapshot();
    model.loadSnapshot(last.snap);
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, { label: last.label, snap: current }],
      baseline: model.toSnapshot(),
      selection: [],
      modelRev: get().modelRev + 1,
      epoch: get().epoch + 1,
      saveState: 'dirty',
      status: `Desfeito: ${last.label}`,
    });
  },

  redo: () => {
    const { undoStack, redoStack } = get();
    const last = redoStack[redoStack.length - 1];
    if (!last) return;
    const current = model.toSnapshot();
    model.loadSnapshot(last.snap);
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, { label: last.label, snap: current }],
      baseline: model.toSnapshot(),
      selection: [],
      modelRev: get().modelRev + 1,
      epoch: get().epoch + 1,
      saveState: 'dirty',
      status: `Refeito: ${last.label}`,
    });
  },

  resetProject: () => {
    model.clear();
    set({
      undoStack: [],
      redoStack: [],
      baseline: model.toSnapshot(),
      selection: [],
      modelRev: get().modelRev + 1,
      epoch: get().epoch + 1,
      projectName: 'Casa sem nome',
      projectId: null,
      saveState: 'clean',
      lastSavedAt: null,
      savedRev: get().modelRev + 1,
      status: 'Projeto novo. Comece pelo contorno da planta.',
    });
  },

  loadSnapshot: (snap, name) => get().openProject(snap, name, null),

  openProject: (snap, name, id) => {
    model.loadSnapshot(snap);
    const rev = get().modelRev + 1;
    set({
      undoStack: [],
      redoStack: [],
      baseline: model.toSnapshot(),
      selection: [],
      modelRev: rev,
      epoch: get().epoch + 1,
      projectName: name,
      projectId: id,
      // Freshly opened from the library it is already written; coming from a
      // file or a template it is not — hence the state depending on the id.
      saveState: id ? 'clean' : 'dirty',
      lastSavedAt: id ? Date.now() : null,
      savedRev: rev,
      status: `Projeto aberto: ${name}`,
    });
  },

  setProjectName: (projectName) => set({ projectName, saveState: 'dirty' }),
  setSaveState: (saveState) => set({ saveState }),
  markSaved: (projectId, lastSavedAt, rev) =>
    set((s) => ({
      projectId,
      lastSavedAt,
      savedRev: rev,
      // If the model moved during the write, there is still something to save.
      saveState: s.modelRev > rev ? 'dirty' : 'clean',
    })),
}));
