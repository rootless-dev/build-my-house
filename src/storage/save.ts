/**
 * Bridge between the store and the local library: writes the project being
 * edited, with a thumbnail grabbed from the viewport itself.
 */

import { model, useApp } from '../state/store';
import type { Viewport } from '../viewer/Viewport';
import { writeProject, type ProjectMeta, type ProjectStats } from './library';

export function currentStats(): ProjectStats {
  const faces = model.faces();
  return {
    vertices: model.vertices.size,
    edges: model.edges.size,
    faces: faces.length,
    area: model.totalArea(),
  };
}

/**
 * Capturing a thumbnail costs tens of milliseconds on a heavy model — orders
 * of magnitude more than the snapshot and the IndexedDB write combined. It is
 * therefore throttled: autosaves reuse the stored image (`writeProject` keeps
 * it when none is passed) and only refresh it once in a while. Explicit saves
 * and leaving for the menu always force a fresh one.
 */
const THUMBNAIL_INTERVAL = 20_000;
let lastThumbnail = { projectId: '', at: 0 };

export interface SaveOptions {
  /** Refresh the thumbnail regardless of the throttle window. */
  thumbnail?: boolean;
}

/** One write at a time: a second call waits for the first to finish. */
let inFlight: Promise<ProjectMeta | null> | null = null;

export function saveCurrentProject(vp: Viewport | null, options: SaveOptions = {}): Promise<ProjectMeta | null> {
  const run = async (): Promise<ProjectMeta | null> => {
    const state = useApp.getState();
    const rev = state.modelRev;
    useApp.getState().setSaveState('saving');
    try {
      const wantsThumbnail =
        options.thumbnail === true ||
        lastThumbnail.projectId !== (state.projectId ?? '') ||
        Date.now() - lastThumbnail.at > THUMBNAIL_INTERVAL;
      // The thumbnail shows the frame the user is looking at — that framing is
      // what makes a project recognisable in the menu grid.
      const thumb = vp && wantsThumbnail ? await vp.captureThumbnail() : undefined;

      const meta = await writeProject({
        id: state.projectId ?? undefined,
        name: state.projectName.trim() || 'Casa sem nome',
        snapshot: model.toSnapshot(),
        stats: currentStats(),
        thumb,
      });

      if (thumb !== undefined) lastThumbnail = { projectId: meta.id, at: Date.now() };
      useApp.getState().markSaved(meta.id, meta.updatedAt, rev);
      return meta;
    } catch (err) {
      useApp.getState().setSaveState('error');
      useApp.getState().pushToast(err instanceof Error ? err.message : 'Não deu para salvar na biblioteca.');
      return null;
    }
  };

  inFlight = (inFlight ?? Promise.resolve(null)).then(run, run);
  return inFlight;
}
