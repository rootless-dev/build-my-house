import { useCallback, useEffect, useRef, useState } from 'react';
import type { Viewport } from '../viewer/Viewport';
import { ViewportCanvas } from './ViewportCanvas';
import { TopBar } from './TopBar';
import { ToolRail } from './ToolRail';
import { RightPanel } from './RightPanel';
import { StatusBar } from './StatusBar';
import { useAutosave } from './useAutosave';
import { saveCurrentProject } from '../storage/save';

export default function App({ onExit }: { onExit: () => void }) {
  const [vp, setVp] = useState<Viewport | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const measureRef = useRef<HTMLInputElement>(null);

  const onReady = useCallback((instance: Viewport | null) => setVp(instance), []);

  useAutosave(vp);

  // Leaving for the menu must not lose work: write before the scene unmounts,
  // and refresh the thumbnail so the card matches what was on screen.
  const backToMenu = useCallback(async () => {
    await saveCurrentProject(vp, { thumbnail: true });
    onExit();
  }, [vp, onExit]);

  // Typing a digit anywhere jumps straight to the measurement box, the way it
  // works in SketchUp.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!/^[0-9.,-]$/.test(e.key)) return;
      const input = measureRef.current;
      if (!input) return;
      input.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TopBar
        vp={vp}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((v) => !v)}
        onExit={() => void backToMenu()}
      />
      <ToolRail />
      <ViewportCanvas onReady={onReady} />
      <RightPanel vp={vp} open={panelOpen} />
      <StatusBar vp={vp} ref={measureRef} />
    </div>
  );
}
