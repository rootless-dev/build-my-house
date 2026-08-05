import { forwardRef, useState, type KeyboardEvent } from 'react';
import { useApp } from '../state/store';
import type { Viewport } from '../viewer/Viewport';

/**
 * The measurement box (VCB). Shows the value the active tool is reading and
 * accepts an exact one: type and press Enter to drive the geometry.
 */
export const StatusBar = forwardRef<HTMLInputElement, { vp: Viewport | null }>(function StatusBar({ vp }, ref) {
  const status = useApp((s) => s.status);
  const value = useApp((s) => s.measureValue);
  const hint = useApp((s) => s.measureHint);
  const [typed, setTyped] = useState('');

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!typed.trim()) return;
      const ok = vp?.applyMeasure(typed.trim());
      if (!ok) useApp.getState().pushToast('Essa ferramenta não aceita esse valor agora.');
      setTyped('');
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setTyped('');
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <footer className="statusbar">
      <p className="statusbar__hint">{status}</p>
      <div className="vcb">
        <span className="vcb__label">{hint || 'medidas'}</span>
        <div className="vcb__field">
          {!typed && <span className="vcb__ghost">{value || '—'}</span>}
          <input
            ref={ref}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={onKeyDown}
            inputMode="decimal"
            aria-label="Caixa de medidas"
            spellCheck={false}
          />
        </div>
      </div>
    </footer>
  );
});
