# Grading-Website

A multi-section gradebook. Each section keeps its own students, weighted grade
categories, assignments, and scores; the Reports page turns those into weighted
final grades you can print.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

| Script            | What it does                                  |
| ----------------- | --------------------------------------------- |
| `npm run dev`     | Dev server with hot reload                    |
| `npm run build`   | Production build into `dist/`                 |
| `npm run preview` | Serve the built `dist/` to check it locally   |
| `npm test`        | Run the unit tests once (Vitest)             |
| `npm run test:watch` | Re-run tests on change                     |
| `npm run app:dev` | Run the desktop app (Tauri) against the dev server |
| `npm run app:build` | Build the Windows installer (`src-tauri/target/release/bundle/`) |

## Layout

```
index.html            markup only — every id here is what the JS binds to
src/
  main.js             boot: wire modules, load data, first render
  render.js           renderAll() — redraws every view
  bus.js              requestRender(), so modules don't import render.js
  state.js            the state object + load/save
  utils.js            uid, escapeHtml, showToast
  grading.js          pure grade math (no DOM) — the part worth unit testing
  grading.test.js     Vitest unit tests for grading.js
  sections.js         section switcher, add/rename/delete
  students.js         student list + search
  categories.js       categories, weights, weight bar
  assignments.js      assignments + the category dropdown
  grades.js           the score matrix
  reports.js          final grades, letter grades, print
  csv.js              CSV parse/serialise + import planning (no DOM) — unit tested
  csv.test.js         Vitest unit tests for csv.js
  portio.js           wires csv.js to the Import/Export buttons + file download
  api/
    index.js          auto-picks the adapter — the only door to storage
    local.js          localStorage — used in a plain browser
    tauri.js          JSON file in the OS app-data folder — used in the desktop app
src-tauri/            the Tauri (Rust) desktop shell — see "Desktop app" below
legacy/
  grading-system.html the original single-file version, kept for reference
```

### How a change flows

A module mutates `state`, calls `scheduleSave()` (debounced 400ms) and
`requestRender()`. `render.js` redraws everything — cheap at classroom scale,
and it means no module needs to know which other views its change affects.

Event handlers are **delegated**: rows carry `data-action` / `data-id` and each
module puts one listener on the container. Inline `onclick=` will not work here
— handlers live in module scope, which the global HTML scope can't reach.

## Data

`src/api/` is the only place that touches storage. Every adapter implements the
same two methods:

```js
load()      // -> Promise<state | null>   null = nothing saved yet
save(state) // -> Promise<void>           throws on failure
```

The adapter is chosen automatically, no config:

| Where it runs            | Adapter    | Storage                                   |
| ------------------------ | ---------- | ----------------------------------------- |
| Tauri desktop app        | `tauri.js` | `gradebook.json` in the OS app-data folder |
| Plain browser (dev/build)| `local.js` | localStorage (this browser only)          |

`index.js` sniffs for the Tauri runtime (`window.__TAURI_INTERNALS__`) and, when
present, dynamically imports `tauri.js`; a browser build never pulls it in. No UI
module knows the difference — the `load()` / `save()` seam is the whole contract.

### State shape

```js
{
  activeSectionId: "ab12cd34",
  sections: [{
    id, name,
    students:    [{ id, name }],
    categories:  [{ id, name, weight }],           // weight is a percentage
    assignments: [{ id, name, categoryId, max }],
    scores:      { "<studentId>_<assignmentId>": { score, excused } }
  }]
}
```

## Grading rules

- A category's percentage is `sum(earned) / sum(max)` over its graded,
  non-excused assignments.
- Categories with nothing graded are skipped, and the remaining weights are
  re-normalised — so a half-finished term reads as a real percentage instead of
  being dragged toward zero.
- Blank (or unparseable) score = not graded yet. "exc." excludes that
  assignment from the student's average entirely.
- Scores above an assignment's max are kept (extra credit) but the box turns
  red so a typo stands out.
- Letters: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, else F.

## Import / export

The Setup page has an **Import & export** card, scoped to the active section.

**Import** reads one of two shapes:

- *Roster* — a single column of names (a `Student` / `Name` header row is
  optional). Each name becomes a student.
- *Grade matrix* — first row is `Student` followed by assignment names; each
  cell is a score, blank (leave as-is), or `EXC` (excused).

Students are matched by name, case-insensitively, and created when missing.
Assignment columns with no name match in the section are reported and skipped —
import never creates categories or assignments. Nothing is written until you
confirm the summary dialog.

**Export** produces either that same grade matrix (a portable backup you can
re-import) or a report summary — `Student, Final %, Letter, <category> %…`,
mirroring the Reports page.

## Desktop app

The shippable form is a Windows desktop app built with [Tauri](https://tauri.app)
(`src-tauri/`). Each teacher installs their own copy; the gradebook is one JSON
file, `gradebook.json`, under `%APPDATA%\com.gradebook.desktop\`. There is no
server, no account, and no sync — moving data between people or machines is done
with the CSV export/import above.

The web build (`npm run dev`, `npm run build`) still works unchanged and uses
localStorage; `src/api/index.js` picks the Tauri file adapter only when it sees
the Tauri runtime.

### Building it

One-time toolchain setup on the build machine (Windows):

1. **Rust** — install via <https://rustup.rs> (`rustup-init.exe`), then restart the shell.
2. **MSVC build tools** — "Desktop development with C++" workload from the
   [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
3. **WebView2** — already present on Windows 10/11; the installer bundles it as a fallback.

Then:

```bash
npm install
npm run app:build      # -> src-tauri/target/release/bundle/nsis/Gradebook_0.1.0_x64-setup.exe
```

`npm run app:dev` runs it live against the Vite dev server for development.

### Icon

`app-icon.png` (repo root, 1024×1024) is the source. Regenerate every size with:

```bash
npx tauri icon app-icon.png
```

Replace `app-icon.png` with real artwork and re-run to rebrand.
