import { Suspense, useCallback, useState } from 'react';
import { emptyBootResult, type BootResult } from '../boot/steps';
import { listProjects, storageInfo } from '../storage/library';
import { useApp } from '../state/store';
import { LoadingScreen } from './LoadingScreen';
import { Home, type OpenRequest } from './Home';
import { Editor } from './load';
import '../styles/app.scss';
import '../styles/shell.scss';

type Phase = 'loading' | 'menu' | 'editor';

/**
 * The application's three screens. The editor is only mounted once a project is
 * open — so the WebGL context is born and dies with it, and going back to the
 * menu hands the GPU back instead of leaving a live scene behind.
 */
export function Root() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [boot, setBoot] = useState<BootResult | null>(null);

  const onBooted = useCallback((result: BootResult) => {
    setBoot(result);
    setPhase('menu');
  }, []);

  const onOpen = useCallback((req: OpenRequest) => {
    useApp.getState().openProject(req.snapshot, req.name, req.id);
    setPhase('editor');
  }, []);

  // By the time we leave the editor the library has already changed (autosave
  // just wrote): the menu must be remounted with a freshly read list, not the
  // one from boot.
  const onExit = useCallback(async () => {
    const [projects, trashed, storage] = await Promise.all([
      listProjects('active'),
      listProjects('trashed'),
      storageInfo(),
    ]);
    setBoot((prev) => ({ ...(prev ?? emptyBootResult()), projects, trashed, storage }));
    setPhase('menu');
  }, []);

  if (phase === 'loading' || !boot) return <LoadingScreen onDone={onBooted} />;
  if (phase === 'menu') return <Home initial={boot} onOpen={onOpen} />;

  // The chunk already arrived during the loading screen's "Motor 3D" step; the
  // Suspense here is only the safety net React requires.
  return (
    <Suspense fallback={null}>
      <Editor onExit={() => void onExit()} />
    </Suspense>
  );
}
