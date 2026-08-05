import type { ReactNode } from 'react';

const wrap = (children: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

/** Isometric thumbnails of the starting points, in the drafting-board stroke. */
const art = (children: ReactNode) => (
  <svg
    viewBox="0 0 64 40"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const isoFloor = (pts: string) => <path d={pts} strokeDasharray="0" />;

export const HomeIcon = {
  plus: wrap(<path d="M12 5v14M5 12h14" />),
  folder: wrap(<path d="M3 7.5h6l2 2.5h10v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" />),
  home: wrap(
    <>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z" />
    </>,
  ),
  projects: wrap(
    <>
      <rect x="3" y="4" width="8" height="7" rx="1" />
      <rect x="13" y="4" width="8" height="7" rx="1" />
      <rect x="3" y="13" width="8" height="7" rx="1" />
      <rect x="13" y="13" width="8" height="7" rx="1" />
    </>,
  ),
  trash: wrap(
    <>
      <path d="M4 6.5h16M9.5 6.5V4.5h5v2" />
      <path d="M6 6.5 7 20a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13.5" />
      <path d="M10.5 10v7M13.5 10v7" />
    </>,
  ),
  search: wrap(
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </>,
  ),
  grid: wrap(
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
    </>,
  ),
  list: wrap(
    <>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
    </>,
  ),
  cube: wrap(
    <>
      <path d="M12 3 21 8v8l-9 5-9-5V8Z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </>,
  ),
  restore: wrap(
    <>
      <path d="M4 11a8 8 0 1 1 2.3 5.7" />
      <path d="M4 5.5V11h5.5" />
    </>,
  ),
  rename: wrap(
    <>
      <path d="M4 16.5 15.5 5a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L7.5 20H4Z" />
      <path d="M14 6.5 17.5 10" />
    </>,
  ),
  duplicate: wrap(
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="1.5" />
      <path d="M15.5 5.5H5a1.5 1.5 0 0 0-1.5 1.5v10.5" />
    </>,
  ),

  template: {
    blank: art(
      <>
        <path d="M6 30h52" strokeDasharray="3 3" opacity="0.5" />
        <path d="M32 30V12M32 30l-14-6M32 30l14-6" />
      </>,
    ),
    plan: art(
      <>
        <path d="M6 30h52" strokeDasharray="3 3" opacity="0.35" />
        {isoFloor('M32 34 10 24l22-10 22 10Z')}
      </>,
    ),
    singlestorey: art(
      <>
        {isoFloor('M32 36 12 27l20-9 20 9Z')}
        <path d="M12 27V15l20-9 20 9v12" />
        <path d="M32 18V6" opacity="0.45" />
      </>,
    ),
    lshape: art(
      <>
        {isoFloor('M32 36 10 26l12-5.5 8 3.5 10-4.5 14 6.5Z')}
        <path d="M10 26V15l12-5.5 8 3.5 10-4.5L54 15v11" />
        <path d="M22 20.5V9.5M30 24V13" opacity="0.45" />
      </>,
    ),
  } as Record<string, ReactNode>,
};
