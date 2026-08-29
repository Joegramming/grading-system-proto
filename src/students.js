import { getActiveSection, scheduleSave } from './state.js';
import { requestRender } from './bus.js';
import { uid, escapeHtml } from './utils.js';
import { confirmAction } from './dialog.js';

let search = '';
let editingId = null;

export function initStudents() {
  document.getElementById('addStudentBtn').addEventListener('click', addStudent);
  document.getElementById('studentNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addStudent();
  });

  document.getElementById('studentSearchSetup').addEventListener('input', e => {
    search = e.target.value.toLowerCase();
    renderStudents();
  });

  const list = document.getElementById('studentList');
  list.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, id } = el.dataset;
    if (action === 'edit') startEdit(id);
    if (action === 'save') commitEdit();
    if (action === 'cancel') cancelEdit();
    if (action === 'remove') removeStudent(id);
  });
  list.addEventListener('keydown', e => {
    if (!editingId) return;
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  });
}

function addStudent() {
  const active = getActiveSection();
  const input = document.getElementById('studentNameInput');
  const name = input.value.trim();
  if (!name || !active) return;
  active.students.push({ id: uid(), name });
  input.value = '';
  scheduleSave('Student added');
  requestRender();
}

function startEdit(id) {
  editingId = id;
  requestRender();
  const field = document.querySelector('#studentList [data-edit-field]');
  if (field) { field.focus(); field.select(); }
}

function cancelEdit() {
  editingId = null;
  requestRender();
}

function commitEdit() {
  const active = getActiveSection();
  const field = document.querySelector('#studentList [data-edit-field]');
  if (!active || !field) return;
  const name = field.value.trim();
  if (!name) { field.focus(); return; }
  const student = active.students.find(s => s.id === editingId);
  if (student) student.name = name;
  editingId = null;
  scheduleSave('Name updated');
  requestRender();
}

async function removeStudent(id) {
  const active = getActiveSection();
  if (!active) return;
  const student = active.students.find(s => s.id === id);
  if (!student) return;

  const scoreCount = Object.keys(active.scores).filter(k => k.startsWith(id + '_')).length;
  const tail = scoreCount ? ` and ${scoreCount} score${scoreCount === 1 ? '' : 's'}` : '';
  const ok = await confirmAction({
    title: 'Delete this student?',
    message: `Delete "${student.name}"${tail}? This can't be undone.`,
    confirmLabel: 'Delete student',
    cancelLabel: 'Keep it',
    tone: 'danger'
  });
  if (!ok) return;

  active.students = active.students.filter(s => s.id !== id);
  // Drop this student's scores so they don't linger as orphans.
  Object.keys(active.scores).forEach(k => {
    if (k.startsWith(id + '_')) delete active.scores[k];
  });
  scheduleSave('Student deleted');
  requestRender();
}

export function renderStudents() {
  const active = getActiveSection();
  const tbody = document.getElementById('studentList');
  const empty = document.getElementById('studentEmpty');
  tbody.innerHTML = '';

  if (!active) {
    empty.style.display = 'block';
    return;
  }

  const filtered = active.students.filter(s => s.name.toLowerCase().includes(search));
  tbody.innerHTML = filtered.map(s => {
    if (s.id === editingId) {
      return `<tr>
        <td><input class="edit-input" type="text" value="${escapeHtml(s.name)}" data-edit-field></td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn-icon save" data-action="save">✓ Save</button>
          <button class="btn-icon" data-action="cancel">Cancel</button>
        </td>
      </tr>`;
    }
    return `<tr>
      <td>${escapeHtml(s.name)}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn-icon edit" data-action="edit" data-id="${s.id}">✎ Edit</button>
        <button class="btn-icon danger" data-action="remove" data-id="${s.id}">✕ Delete</button>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('studentCountTag').textContent = `(${active.students.length})`;
  empty.style.display = filtered.length ? 'none' : 'block';
  empty.textContent = active.students.length
    ? 'No students match your search.'
    : 'No students yet — add your first one above.';
}
