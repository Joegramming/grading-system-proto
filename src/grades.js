import { getActiveSection, scheduleSave } from './state.js';
import { escapeHtml } from './utils.js';

let search = '';

/** Parse a raw score-box value: '' or non-numeric -> null (not graded). */
export function parseScoreInput(raw) {
  const t = String(raw).trim();
  if (t === '') return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : Math.max(0, n);
}

export function initGrades() {
  document.getElementById('studentSearchGrades').addEventListener('input', e => {
    search = e.target.value.toLowerCase();
    renderGradesMatrix();
  });

  const matrix = document.getElementById('gradesMatrix');

  // Delegated so the matrix can be re-rendered freely without re-binding.
  matrix.addEventListener('change', e => {
    const el = e.target;
    if (el.matches('[data-action="score"]')) setScore(el.dataset.key, el.value);
    if (el.matches('[data-action="excuse"]')) setExcused(el.dataset.key, el.checked);
  });

  // Live over-max highlight while typing, without a re-render stealing focus.
  matrix.addEventListener('input', e => {
    const el = e.target;
    if (!el.matches('[data-action="score"]')) return;
    const max = parseFloat(el.max);
    const val = parseFloat(el.value);
    el.classList.toggle('over-max', !isNaN(val) && !isNaN(max) && val > max);
  });
}

function entryFor(section, key) {
  if (!section.scores[key]) section.scores[key] = { score: null, excused: false };
  return section.scores[key];
}

function setScore(key, val) {
  const active = getActiveSection();
  if (!active) return;
  entryFor(active, key).score = parseScoreInput(val);
  scheduleSave('Grades saved');
  // Deliberately no re-render — that would yank focus mid tab-through.
}

function setExcused(key, checked) {
  const active = getActiveSection();
  if (!active) return;
  entryFor(active, key).excused = checked;
  scheduleSave('Grades saved');
  renderGradesMatrix(); // redraw to enable/disable the score box
}

export function renderGradesMatrix() {
  const active = getActiveSection();
  const table = document.getElementById('gradesMatrix');
  const empty = document.getElementById('matrixEmpty');

  if (!active || !active.students.length || !active.assignments.length) {
    table.innerHTML = '';
    empty.style.display = 'block';
    empty.textContent = 'Add students and assignments in Setup first.';
    return;
  }

  const filtered = active.students.filter(s => s.name.toLowerCase().includes(search));
  if (!filtered.length) {
    table.innerHTML = '';
    empty.style.display = 'block';
    empty.textContent = 'No students match your search.';
    return;
  }
  empty.style.display = 'none';

  const head = `<thead><tr><th>Student</th>${active.assignments.map(a => {
    const cat = active.categories.find(c => c.id === a.categoryId);
    return `<th>
      <div class="cat-header">${cat ? escapeHtml(cat.name) : ''}</div>
      ${escapeHtml(a.name)}<br>
      <span style="color:var(--ink-muted);font-weight:400;">/ ${a.max}</span>
    </th>`;
  }).join('')}</tr></thead>`;

  const body = `<tbody>${filtered.map(s => {
    const cells = active.assignments.map(a => {
      const key = s.id + '_' + a.id;
      const entry = active.scores[key] || { score: null, excused: false };
      const graded = entry.score !== null && entry.score !== undefined;
      const value = graded ? entry.score : '';
      const over = graded && Number(entry.score) > a.max;
      return `<td>
        <input type="number" class="score-input${over ? ' over-max' : ''}" min="0" max="${a.max}"
          value="${value}" ${entry.excused ? 'disabled' : ''}
          data-action="score" data-key="${key}" placeholder="—"
          title="${over ? 'Above the ' + a.max + '-point maximum' : ''}">
        <label class="exc-label">
          <input type="checkbox" ${entry.excused ? 'checked' : ''}
            data-action="excuse" data-key="${key}"> exc.
        </label>
      </td>`;
    }).join('');
    return `<tr><td style="font-weight:600;">${escapeHtml(s.name)}</td>${cells}</tr>`;
  }).join('')}</tbody>`;

  table.innerHTML = head + body;
}
