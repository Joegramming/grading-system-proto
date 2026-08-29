/**
 * Desktop adapter — persists the whole `state` object as one JSON file in the
 * OS app-data folder. The path work lives in Rust (src-tauri/src/lib.rs); this
 * side just moves a string across the `invoke` bridge.
 *
 * Only imported when index.js detects the Tauri runtime, so a browser build
 * never pulls in @tauri-apps/api.
 */
import { invoke } from '@tauri-apps/api/core';

export const tauriAdapter = {
  name: 'tauri',

  async load() {
    const json = await invoke('load_gradebook'); // string | null
    return json ? JSON.parse(json) : null;
  },

  async save(state) {
    await invoke('save_gradebook', { data: JSON.stringify(state) });
  }
};
