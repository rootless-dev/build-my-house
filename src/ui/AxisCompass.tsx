import { useEffect, useRef, type RefObject } from 'react';
import type { Viewport } from '../viewer/Viewport';

const R = 26;
const AXES = [
  { key: 'x', color: '#d6304a', label: 'X' },
  { key: 'y', color: '#2e9e5b', label: 'Y' },
  { key: 'z', color: '#2e6fd6', label: 'Z' },
] as const;

/**
 * Axis compass: shows where red, green and blue point in the current view.
 * Updates outside React so it can follow the orbit without re-rendering.
 */
export function AxisCompass({ viewportRef }: { viewportRef: RefObject<Viewport | null> }) {
  const lines = useRef<Record<string, SVGLineElement | null>>({});
  const labels = useRef<Record<string, SVGTextElement | null>>({});

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const vp = viewportRef.current;
      if (!vp) return;
      const dirs = vp.compassAngles();
      for (const axis of AXES) {
        const [dx, dy] = dirs[axis.key];
        const line = lines.current[axis.key];
        const label = labels.current[axis.key];
        if (line) {
          line.setAttribute('x2', String(37 + dx * R));
          line.setAttribute('y2', String(37 + dy * R));
        }
        if (label) {
          label.setAttribute('x', String(37 + dx * (R + 7)));
          label.setAttribute('y', String(37 + dy * (R + 7) + 3));
        }
      }
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [viewportRef]);

  return (
    <div className="compass" aria-hidden="true">
      <svg viewBox="0 0 74 74" width="74" height="74">
        <circle cx="37" cy="37" r={R} fill="none" stroke="#1b2028" strokeOpacity="0.18" strokeDasharray="2 3" />
        {AXES.map((axis) => (
          <g key={axis.key}>
            <line
              ref={(el) => {
                lines.current[axis.key] = el;
              }}
              x1="37"
              y1="37"
              x2="37"
              y2="37"
              stroke={axis.color}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <text
              ref={(el) => {
                labels.current[axis.key] = el;
              }}
              x="37"
              y="37"
              fill={axis.color}
              textAnchor="middle"
            >
              {axis.label}
            </text>
          </g>
        ))}
        <circle cx="37" cy="37" r="2" fill="#1b2028" fillOpacity="0.5" />
      </svg>
    </div>
  );
}
