/**
 * The steps the loading screen runs. Every one does real work and can really
 * fail: the progress reflects what is actually ready, not a timer.
 */

import { listProjects, openLibrary, requestPersistence, storageInfo } from '../storage/library';
import type { ProjectMeta, StorageInfo } from '../storage/library';
import { loadEditor } from '../ui/load';

export interface BootResult {
  projects: ProjectMeta[];
  trashed: ProjectMeta[];
  storage: StorageInfo;
  gpu: string;
}

export interface BootStep {
  id: string;
  label: string;
  run: (acc: BootResult) => Promise<void>;
}

/** Finds out whether WebGL is usable and which adapter is behind it. */
async function probeWebGL(): Promise<string> {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  if (!gl) {
    throw new Error('Este navegador não conseguiu abrir um contexto WebGL — sem ele não há como desenhar em 3D.');
  }
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'aceleração disponível';
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
}

export const BOOT_STEPS: BootStep[] = [
  {
    id: 'fontes',
    label: 'Tipografia',
    run: async () => {
      await document.fonts.ready;
    },
  },
  {
    id: 'gpu',
    label: 'Aceleração gráfica',
    run: async (acc) => {
      acc.gpu = await probeWebGL();
    },
  },
  {
    id: 'motor',
    label: 'Motor 3D',
    run: async () => {
      await loadEditor();
    },
  },
  {
    id: 'biblioteca',
    label: 'Biblioteca local',
    run: async (acc) => {
      await openLibrary();
      await requestPersistence();
      acc.storage = await storageInfo();
    },
  },
  {
    id: 'projetos',
    label: 'Projetos salvos',
    run: async (acc) => {
      // The list leaves ready so the menu need not fetch again on mount.
      acc.projects = await listProjects('active');
      acc.trashed = await listProjects('trashed');
    },
  },
];

export function emptyBootResult(): BootResult {
  return { projects: [], trashed: [], storage: { usage: 0, quota: 0, persisted: false }, gpu: '' };
}
