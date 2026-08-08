/**
 * The editor drags three.js and every tool along with it. Keeping it behind a
 * dynamic `import()` splits that weight into its own chunk, which the loading
 * screen genuinely fetches before releasing the menu — instead of faking a
 * progress bar while the browser had already downloaded everything.
 *
 * Both exports point at the same `import()`: by the time the menu mounts the
 * editor the module is already in the registry and nothing is fetched again.
 */

import { lazy } from 'react';

export const loadEditor = () => import('./App');

export const Editor = lazy(loadEditor);
