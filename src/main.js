import { loadState } from './state.js';
import { onRender } from './bus.js';
import { renderAll } from './render.js';
import { initNav } from './nav.js';
import { initSubjects } from './subjects.js';
import { initTerms } from './terms.js';
import { initStudents } from './students.js';
import { initCategories } from './categories.js';
import { initAssignments } from './assignments.js';
import { initGrades } from './grades.js';
import { initReports } from './reports.js';
import { initPortIO } from './portio.js';

async function boot() {
  // Any module can call requestRender() after mutating state.
  onRender(renderAll);

  // Shown only in the `npm run deploy` (Pages preview) build.
  if (import.meta.env.VITE_PREVIEW) {
    const note = document.getElementById('previewNote');
    if (note) note.style.display = 'block';
  }

  initNav();
  initSubjects();
  initTerms();
  initStudents();
  initCategories();
  initAssignments();
  initGrades();
  initReports();
  initPortIO();

  await loadState();
  renderAll();
}

boot();
