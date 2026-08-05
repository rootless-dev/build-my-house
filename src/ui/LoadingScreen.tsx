import { useCallback, useEffect, useState } from 'react';
import { BOOT_STEPS, emptyBootResult, type BootResult } from '../boot/steps';

type StepState = 'pending' | 'running' | 'done' | 'failed';

/** Display floor: without it a fast machine would only show a flash. */
const MIN_MS = 700;

export function LoadingScreen({ onDone }: { onDone: (result: BootResult) => void }) {
  const [states, setStates] = useState<StepState[]>(() => BOOT_STEPS.map(() => 'pending'));
  const [error, setError] = useState<string | null>(null);
  const [gpu, setGpu] = useState('');
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setStates(BOOT_STEPS.map(() => 'pending'));
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    const started = performance.now();
    const acc = emptyBootResult();

    const mark = (i: number, state: StepState) =>
      setStates((prev) => {
        const next = [...prev];
        next[i] = state;
        return next;
      });

    void (async () => {
      for (let i = 0; i < BOOT_STEPS.length; i++) {
        if (!alive) return;
        mark(i, 'running');
        try {
          await BOOT_STEPS[i].run(acc);
        } catch (err) {
          if (!alive) return;
          mark(i, 'failed');
          setError(err instanceof Error ? err.message : 'Algo falhou ao preparar o aplicativo.');
          return;
        }
        if (!alive) return;
        mark(i, 'done');
        if (acc.gpu) setGpu(acc.gpu);
      }
      const rest = MIN_MS - (performance.now() - started);
      if (rest > 0) await new Promise((r) => setTimeout(r, rest));
      if (alive) onDone(acc);
    })();

    return () => {
      alive = false;
    };
  }, [attempt, onDone]);

  const done = states.filter((s) => s === 'done').length;
  const pct = Math.round((done / BOOT_STEPS.length) * 100);

  return (
    <div className="boot">
      <div className="boot__sheet">
        <div className="boot__brand">
          Build <span className="boot__brand-weak">my</span> House
        </div>
        <div className="boot__sub">modelagem 3d no navegador</div>

        <div className="boot__bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`boot__fill${error ? ' boot__fill--error' : ''}`} style={{ width: `${pct}%` }} />
        </div>

        <ul className="boot__steps">
          {BOOT_STEPS.map((step, i) => (
            <li key={step.id} className={`boot__step boot__step--${states[i]}`}>
              <span className="boot__glyph" aria-hidden="true" />
              <span className="boot__label">{step.label}</span>
              <span className="boot__note">
                {step.id === 'gpu' && states[i] === 'done' ? gpu : states[i] === 'done' ? 'pronto' : ''}
              </span>
            </li>
          ))}
        </ul>

        {error ? (
          <div className="boot__error">
            <p>{error}</p>
            <button type="button" className="btn btn--primary" onClick={retry}>
              Tentar de novo
            </button>
          </div>
        ) : (
          <div className="boot__pct">{pct}%</div>
        )}
      </div>
    </div>
  );
}
