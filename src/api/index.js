/**
 * The one place the app talks to storage.
 *
 * Every adapter implements the same two methods:
 *   load()       -> Promise<state | null>   null means "nothing saved yet"
 *   save(state)  -> Promise<void>           throws on failure
 *
 * Nothing outside this folder should know which one is active.
 *
 *   - Running inside the Tauri desktop shell -> `tauri.js`, a JSON file in the
 *     OS app-data folder.
 *   - Plain browser (dev server, `npm run build`) -> `local.js`, localStorage.
 *
 * The choice is automatic: no env var, no config.
 */
import { localAdapter } from './local.js';

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let api = localAdapter;

if (inTauri) {
  const { tauriAdapter } = await import('./tauri.js');
  api = tauriAdapter;
}

export { api };
