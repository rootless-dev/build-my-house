import { useCallback, useEffect, useRef, useState } from 'react';
import type { Viewport } from '../viewer/Viewport';
import { ViewportCanvas } from './ViewportCanvas';
import { TopBar } from './TopBar';
import { ToolRail } from './ToolRail';
import { RightPanel } from './RightPanel';
import { StatusBar } from './StatusBar';
import '../styles/app.scss';

export default function App() {
  const [vp, setVp] = useState<Viewport | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const measureRef = useRef<HTMLInputElement>(null);

  const onReady = useCallback((instance: Viewport | null) => setVp(instance), []);

  // Digitar um número em qualquer lugar leva direto à caixa de medidas,
  // como acontece no SketchUp.
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
      <TopBar vp={vp} panelOpen={panelOpen} onTogglePanel={() => setPanelOpen((v) => !v)} />
      <ToolRail />
      <ViewportCanvas onReady={onReady} />
      <RightPanel vp={vp} open={panelOpen} />
      <StatusBar vp={vp} ref={measureRef} />
    </div>
  );
}
