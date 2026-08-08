import { useEffect } from 'react';
import { useApp } from '../state/store';
import { saveCurrentProject } from '../storage/save';
import type { Viewport } from '../viewer/Viewport';

const DELAY = 1500;

/**
 * Writes the project on its own shortly after each committed operation, and
 * also when the tab goes out of sight — the last reliable chance to write
 * before the user closes everything (`beforeunload` will not await a promise).
 *
 * The timer is only armed on the transition into `dirty`, so a burst of edits
 * collapses into a single write instead of restarting the countdown forever.
 */
export function useAutosave(vp: Viewport | null): void {
  useEffect(() => {
    let timer: number | undefined;

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void saveCurrentProject(vp), DELAY);
    };

    const unsub = useApp.subscribe((s, prev) => {
      if (s.saveState === 'dirty' && prev.saveState !== 'dirty') schedule();
    });

    if (useApp.getState().saveState === 'dirty') schedule();

    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      if (useApp.getState().saveState === 'clean') return;
      window.clearTimeout(timer);
      void saveCurrentProject(vp);
    };
    document.addEventListener('visibilitychange', onHide);

    return () => {
      window.clearTimeout(timer);
      unsub();
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [vp]);
}
