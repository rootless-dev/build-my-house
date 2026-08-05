import { create } from 'zustand';
import { Model } from '../core/model';
import type { EntityRef, ModelSnapshot } from '../core/types';
import type { ToolId } from '../tools/base';
import type { ViewStyle } from '../viewer/ModelView';
import type { Unit } from '../core/units';

/** Instância única do modelo. Mutável fora do React — a store só avisa a UI. */
export const model = new Model();

const HISTORY_LIMIT = 80;

export interface Toast {
  id: number;
  text: string;
}

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
  /** Sobe a cada operação confirmada — quem depende do modelo observa isto. */
  modelRev: number;
  /** Sobe quando o modelo é trocado por inteiro (novo, abrir, desfazer). */
  epoch: number;
  undoStack: { label: string; snap: ModelSnapshot }[];
  redoStack: { label: string; snap: ModelSnapshot }[];
  baseline: ModelSnapshot;
  projectName: string;

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
  setProjectName: (name: string) => void;
}

let toastId = 0;

export const useApp = create<AppState>((set, get) => ({
  tool: 'linha',
  selection: [],
  activeMaterial: null,
  unit: 'm',
  polygonSides: 6,
  style: 'sombreado',
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
      status: 'Projeto novo. Comece pelo contorno da planta.',
    });
  },

  loadSnapshot: (snap, name) => {
    model.loadSnapshot(snap);
    set({
      undoStack: [],
      redoStack: [],
      baseline: model.toSnapshot(),
      selection: [],
      modelRev: get().modelRev + 1,
      epoch: get().epoch + 1,
      projectName: name,
      status: `Projeto aberto: ${name}`,
    });
  },

  setProjectName: (projectName) => set({ projectName }),
}));
