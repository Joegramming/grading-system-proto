import {
  state, getActiveSubject, getActiveSemester, createSubject, createSemester,
  subjectsInSemester, subjectLabel, reconcileState, scheduleSave
} from './state.js';
import { requestRender } from './bus.js';
import { escapeHtml } from './utils.js';
import { confirmAction } from './dialog.js';

const FIELDS = [
  ['code', 'courseCode'],
  ['name', 'courseName'],
  ['schedule', 'courseSchedule'],
  ['set', 'courseSet'],
  ['courseYear', 'courseYear'],
  ['instructor', 'courseInstructor'],
  ['programChair', 'courseProgramChair']
];

/** Make sure there is an active semester, creating a blank one if needed. */
function ensureSemester() {
  if (getActiveSemester()) return;
  const sem = createSemester({ schoolYear: '', label: '' });
  state.semesters.push(sem);
  state.activeSemesterId = sem.id;
}

export function initSubjects() {
  document.getElementById('subjectSelect').addEventListener('change', e => {
    state.activeSubjectId = e.target.value;
    scheduleSave();
    requestRender();
  });

  document.getElementById('addSubjectBtn').addEventListener('click', addSubject);
  document.getElementById('addSubjectBtn2').addEventListener('click', addSubject);

  document.getElementById('subjectList').addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, id } = el.dataset;
    if (action === 'switch') switchTo(id);
    if (action === 'remove') removeSubject(id);
  });

  // The details form auto-saves on blur. Typing into it with no subject yet
  // creates the first one (and a semester if needed).
  for (const [key, inputId] of FIELDS) {
    document.getElementById(inputId).addEventListener('change', e => {
      const value = e.target.value.trim();
      let subject = getActiveSubject();
      if (!subject) {
        if (!value) return;
        ensureSemester();
        subject = createSubject({}, state.activeSemesterId);
        state.subjects.push(subject);
        state.activeSubjectId = subject.id;
      }
      subject.course[key] = value;
      scheduleSave('Subject details saved');
      requestRender();
    });
  }
}

function addSubject() {
  ensureSemester();
  const s = createSubject({}, state.activeSemesterId);
  state.subjects.push(s);
  state.activeSubjectId = s.id;
  scheduleSave('Subject added');
  requestRender();
  const first = document.getElementById('courseCode');
  if (first) first.focus();
}

function switchTo(id) {
  state.activeSubjectId = id;
  scheduleSave();
  requestRender();
}

async function removeSubject(id) {
  const subject = state.subjects.find(s => s.id === id);
  if (!subject) return;
  const ok = await confirmAction({
    title: 'Delete this subject?',
    message: `Delete "${subjectLabel(subject)}" and all its students, terms, and grades? This can't be undone.`,
    confirmLabel: 'Delete subject',
    cancelLabel: 'Keep it',
    tone: 'danger'
  });
  if (!ok) return;

  state.subjects = state.subjects.filter(s => s.id !== id);
  reconcileState();
  scheduleSave('Subject deleted');
  requestRender();
}

export function renderSubjectSwitcher() {
  const sel = document.getElementById('subjectSelect');
  const mine = subjectsInSemester(state.activeSemesterId);

  if (!mine.length) {
    sel.innerHTML = '<option value="">No subjects yet</option>';
    sel.disabled = true;
  } else {
    sel.disabled = false;
    sel.innerHTML = mine
      .map(s => `<option value="${s.id}" ${s.id === state.activeSubjectId ? 'selected' : ''}>${escapeHtml(subjectLabel(s))}</option>`)
      .join('');
  }

  const active = getActiveSubject();
  document.getElementById('subjectMeta').textContent =
    active ? `${active.students.length} student${active.students.length === 1 ? '' : 's'}` : '';

  const totalStudents = mine.reduce((sum, s) => sum + s.students.length, 0);
  document.getElementById('totalCountDisplay').textContent =
    `${mine.length} subject${mine.length === 1 ? '' : 's'} · ${totalStudents} student${totalStudents === 1 ? '' : 's'}`;
  document.getElementById('courseTitleDisplay').textContent = active ? subjectLabel(active) : '—';
  document.getElementById('courseInitial').textContent =
    active ? (active.course.code || active.course.name || 'S').charAt(0).toUpperCase() : 'S';

  const label = active ? subjectLabel(active) : 'this subject';
  document.getElementById('setupHeroTitle').textContent = `Set up ${label}.`;
  document.getElementById('gradesHeroTitle').textContent = `Enter scores for ${label}.`;
  document.getElementById('reportsHeroTitle').textContent = `Grades for ${label}.`;
}

export function renderSubjectDetails() {
  const active = getActiveSubject();
  for (const [key, inputId] of FIELDS) {
    document.getElementById(inputId).value = active ? (active.course[key] || '') : '';
  }
}

export function renderSubjectList() {
  const tbody = document.getElementById('subjectList');
  const mine = subjectsInSemester(state.activeSemesterId);
  if (!mine.length) {
    tbody.innerHTML = '<tr><td class="list-empty">No subjects in this semester yet — click "Add subject".</td></tr>';
    return;
  }
  tbody.innerHTML = mine.map(s => {
    const isActive = s.id === state.activeSubjectId;
    const dot = isActive ? '<span style="color:var(--good);">●</span>' : '';
    const sub = escapeHtml(s.course.name || '—');
    return `<tr class="${isActive ? 'active-row' : ''}">
      <td style="width:20px;">${dot}</td>
      <td style="cursor:pointer;" data-action="switch" data-id="${s.id}">
        <div style="font-weight:600;">${escapeHtml(subjectLabel(s))}</div>
        <div style="color:var(--ink-muted);font-size:13px;">${sub}</div>
      </td>
      <td style="color:var(--ink-muted);font-family:'JetBrains Mono',monospace;">${s.students.length} students</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn-icon danger" data-action="remove" data-id="${s.id}">✕ Delete</button>
      </td>
    </tr>`;
  }).join('');
}
