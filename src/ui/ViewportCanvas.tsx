import { useEffect, useRef } from 'react';
import { Viewport } from '../viewer/Viewport';
import { useApp } from '../state/store';
import { AxisCompass } from './AxisCompass';
import { Toast } from './Toast';

export function ViewportCanvas({ onReady }: { onReady: (vp: Viewport | null) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const vpRef = useRef<Viewport | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const vp = new Viewport(host);
    vpRef.current = vp;
    onReady(vp);
    if (import.meta.env.DEV) (window as unknown as { __vp?: Viewport }).__vp = vp;

    const ro = new ResizeObserver(() => vp.resize());
    ro.observe(host);

    // A store é a fonte da verdade da UI; o viewport reage a ela.
    const unsubModel = useApp.subscribe((s, prev) => {
      if (s.epoch !== prev.epoch) vp.cancelTool();
      if (s.modelRev !== prev.modelRev) vp.refreshModel();
      if (s.tool !== prev.tool) vp.setTool(s.tool);
    });

    vp.zoomExtents();

    return () => {
      ro.disconnect();
      unsubModel();
      vp.dispose();
      vpRef.current = null;
      onReady(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="viewport">
      <div className="viewport-stage" ref={hostRef} />
      <AxisCompass viewportRef={vpRef} />
      <Toast />
    </div>
  );
}
