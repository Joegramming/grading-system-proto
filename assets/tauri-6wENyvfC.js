async function e(r,n={},a){return window.__TAURI_INTERNALS__.invoke(r,n,a)}const o={name:"tauri",async load(){const r=await e("load_gradebook");return r?JSON.parse(r):null},async save(r){await e("save_gradebook",{data:JSON.stringify(r)})}};export{o as tauriAdapter};
//# sourceMappingURL=tauri-6wENyvfC.js.map
