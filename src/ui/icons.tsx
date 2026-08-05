import type { ReactNode } from 'react';
import type { ToolId } from '../tools/base';

const wrap = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const dot = (cx: number, cy: number) => <circle cx={cx} cy={cy} r={1.6} fill="currentColor" stroke="none" />;

export const ToolIcon: Record<ToolId, ReactNode> = {
  selecionar: wrap(<path d="M5 3.5 18 11l-5.4 1.6L10 19 5 3.5Z" />),
  linha: wrap(
    <>
      <path d="M5.5 18.5 18.5 5.5" />
      {dot(5.5, 18.5)}
      {dot(18.5, 5.5)}
    </>,
  ),
  retangulo: wrap(
    <>
      <rect x="4" y="6" width="16" height="12" rx="0.5" />
      {dot(4, 6)}
      {dot(20, 18)}
    </>,
  ),
  circulo: wrap(
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 12h7.5" strokeDasharray="2 2" />
      {dot(12, 12)}
    </>,
  ),
  poligono: wrap(<path d="M12 4.2 19 8.3v8.2L12 20.6 5 16.5V8.3Z" />),
  arco: wrap(
    <>
      <path d="M4 17.5a8 8 0 0 1 16 0" />
      <path d="M4 17.5h16" strokeDasharray="2.5 2.5" />
      {dot(4, 17.5)}
      {dot(20, 17.5)}
      {dot(12, 9.5)}
    </>,
  ),
  escala: wrap(
    <>
      <path d="M4 20V9.5L14.5 20Z" />
      <rect x="14" y="4" width="6" height="6" rx="0.5" />
      <path d="M11 13 17 7" strokeDasharray="2 2" />
    </>,
  ),
  cotar: wrap(
    <>
      <path d="M3 7v10M21 7v10M3 12h18" />
      <path d="m6 9-3 3 3 3M18 9l3 3-3 3" />
    </>,
  ),
  texto: wrap(
    <>
      <path d="M4 5.5h10M9 5.5V17" />
      <path d="M13 19.5h7" />
      <path d="m13 19.5 5-5" />
      {dot(20, 19.5)}
    </>,
  ),
  empurrar: wrap(
    <>
      <path d="M4 14.5 10 18l10-4V7.5L14 4 4 8Z" />
      <path d="M4 8l6 3.5 10-4M10 11.5V18" />
      <path d="M15.5 9.5V2.5m0 0-2 2m2-2 2 2" stroke="currentColor" />
    </>,
  ),
  mover: wrap(
    <>
      <path d="M12 3v18M3 12h18" />
      <path d="m12 3-2.2 2.4M12 3l2.2 2.4M12 21l-2.2-2.4M12 21l2.2-2.4M3 12l2.4-2.2M3 12l2.4 2.2M21 12l-2.4-2.2M21 12l-2.4 2.2" />
    </>,
  ),
  girar: wrap(
    <>
      <path d="M20 12a8 8 0 1 1-3.1-6.3" />
      <path d="M17.3 2.6v3.4h-3.4" />
      {dot(12, 12)}
    </>,
  ),
  deslocar: wrap(
    <>
      <rect x="3" y="5" width="18" height="14" rx="0.5" />
      <rect x="6.5" y="8" width="11" height="8" rx="0.5" strokeDasharray="2.5 2" />
    </>,
  ),
  borracha: wrap(
    <>
      <path d="M8.5 19.5H20" />
      <path d="m3.8 14.3 6.4-6.4a1.6 1.6 0 0 1 2.3 0l3.9 3.9a1.6 1.6 0 0 1 0 2.3l-5.4 5.4H7.5l-3.7-3.7a1.6 1.6 0 0 1 0-2.3Z" />
    </>,
  ),
  pintar: wrap(
    <>
      <path d="m10.5 3.5 8.5 8.5-6.6 6.6a1.8 1.8 0 0 1-2.6 0l-5.9-5.9a1.8 1.8 0 0 1 0-2.6Z" />
      <path d="M8 6 6 4" />
      <path d="M20 15.5c1.3 1.8 1.9 3 1.9 3.7a1.9 1.9 0 1 1-3.8 0c0-.7.6-1.9 1.9-3.7Z" fill="currentColor" stroke="none" />
    </>,
  ),
  trena: wrap(
    <>
      <rect x="2.5" y="8" width="19" height="8" rx="1" />
      <path d="M6.5 8v3M10 8v4.5M13.5 8v3M17 8v4.5" />
    </>,
  ),
  orbitar: wrap(
    <>
      <circle cx="12" cy="12" r="4" />
      <ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(-28 12 12)" strokeDasharray="3 2.5" />
    </>,
  ),
  pan: wrap(
    <path d="M8 11V5.6a1.6 1.6 0 0 1 3.2 0V11m0-1.2a1.6 1.6 0 1 1 3.2 0V11m0-.6a1.6 1.6 0 1 1 3.2 0v4.4c0 3.2-2.2 5.7-5.6 5.7-2.4 0-3.9-1-5.2-2.7l-2.5-3.5a1.6 1.6 0 0 1 2.4-2.1L8 13.6V11" />
  ),
};

export const UiIcon = {
  novo: wrap(<><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></>),
  abrir: wrap(<path d="M3 7.5h6l2 2.5h10v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" />),
  salvar: wrap(<><path d="M4 4h13l3 3v13H4z" /><path d="M8 4v6h8V4M8 20v-6h8v6" /></>),
  exportar: wrap(<><path d="M12 15V3m0 0L8.5 6.5M12 3l3.5 3.5" /><path d="M4 14v5.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V14" /></>),
  desfazer: wrap(<><path d="M4 9h11a5 5 0 0 1 0 10H8" /><path d="M4 9l4-4M4 9l4 4" /></>),
  refazer: wrap(<><path d="M20 9H9a5 5 0 0 0 0 10h7" /><path d="m20 9-4-4m4 4-4 4" /></>),
  enquadrar: wrap(<><path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5" /><rect x="8.5" y="8.5" width="7" height="7" rx="0.5" /></>),
  painel: wrap(<><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M15 4v16" /></>),
};
