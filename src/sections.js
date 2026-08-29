import { state, getActiveSection, createSection, scheduleSave } from './state.js';
import { requestRender } from './bus.js';
import { escapeHtml } from './utils.js';
import { confirmAction, promptText } from './dialog.js';

let editingId = null;

export function initSections() {
  document.getElementById('sectionSelect').addEventListener('change', e => {
    state.activeSectionId = e.target.value;
    scheduleSave();
    requestRender();
  });

  document.getElementById('addSectionBtn').addEventListener('click', quickAddSection);
  document.getElementById('addSectionBtn2').addEventListener('click', addSectionFromForm);

  document.getElementById('newSectionInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addSectionFromForm();
  });

  const list = document.getElementById('sectionList');
  list.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, id } = el.dataset;
    if (action === 'switch') switchToSection(id);
    if (action === 'edit') startEdit(id);
    if (action === 'save') commitEdit();
    if (action === 'cancel') cancelEdit();
    if (action === 'remove') removeSection(id);
  });
  list.addEventListener('keydown', e => {
    if (!editingId) return;
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  });
}

async function quickAddSection() {
  const name = await promptText({
    title: 'Add a section',
    message: 'Name for the new section/block:',
    placeholder: 'e.g. Grade 9 - Block A',
    confirmLabel: 'Add section'
  });
  if (name) addSection(name);
}

function addSectionFromForm() {
  const input = document.getElementById('newSectionInput');
  const name = input.value.trim();
  if (!name) return;
  input.value = '';
  addSection(name);
}

function addSection(name) {
  const s = createSection(name);
  state.sections.push(s);
  state.activeSectionId = s.id;
  scheduleSave('Section added');
  requestRender();
}

function switchToSection(id) {
  state.activeSectionId = id;
  scheduleSave();
  requestRender();
}

function startEdit(id) {
  editingId = id;
  requestRender();
  const field = document.querySelector('#sectionList [data-edit-field]');
  if (field) { field.focus(); field.select(); }
}

function cancelEdit() {
  editingId = null;
  requestRender();
}

function commitEdit() {
  const field = document.querySelector('#sectionList [data-edit-field]');
  if (!field) return;
  const name = field.value.trim();
  if (!name) { field.focus(); return; }
  const sec = state.sections.find(s => s.id === editingId);
  if (sec) sec.name = name;
  editingId = null;
  scheduleSave('Section renamed');
  requestRender();
}

async function removeSection(id) {
  if (state.sections.length <= 1) {
    await confirmAction({
      title: "Can't delete this section",
      message: 'You need at least one section.',
      confirmLabel: 'OK',
      cancelLabel: null
    });
    return;
  }
  const sec = state.sections.find(s => s.id === id);
  if (!sec) return;
  const ok = await confirmAction({
    title: 'Delete this section?',
    message: `Delete "${sec.name}" and all its students, grades, and assignments? This can't be undone.`,
    confirmLabel: 'Delete section',
    cancelLabel: 'Keep it',
    tone: 'danger'
  });
  if (!ok) return;

  state.sections = state.sections.filter(s => s.id !== id);
  if (state.activeSectionId === id) state.activeSectionId = state.sections[0].id;
  scheduleSave('Section deleted');
  requestRender();
}

export function renderSectionSwitcher() {
  const sel = document.getElementById('sectionSelect');
  sel.innerHTML = state.sections
    .map(s => `<option value="${s.id}" ${s.id === state.activeSectionId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
    .join('');

  const active = getActiveSection();
  document.getElementById('sectionMeta').textContent =
    active ? `${active.students.length} student${active.students.length === 1 ? '' : 's'}` : '';

  const totalStudents = state.sections.reduce((sum, s) => sum + s.students.length, 0);
  document.getElementById('totalCountDisplay').textContent =
    `${state.sections.length} section${state.sections.length === 1 ? '' : 's'} · ${totalStudents} total`;
  document.getElementById('courseTitleDisplay').textContent = active ? active.name : '—';
  document.getElementById('courseInitial').textContent = active ? active.name.charAt(0).toUpperCase() : 'S';

  document.getElementById('setupHeroTitle').textContent =
    active ? `Build ${active.name}, once.` : 'Build this section, once.';
  document.getElementById('gradesHeroTitle').textContent =
    active ? `Enter scores for ${active.name}.` : "Enter today's scores.";
  document.getElementById('reportsHeroTitle').textContent =
    active ? `See how ${active.name} is doing.` : 'See how this section is doing.';
}

export function renderSectionList() {
  const tbody = document.getElementById('sectionList');
  tbody.innerHTML = state.sections.map(s => {
    const isActive = s.id === state.activeSectionId;
    const dot = isActive ? '<span style="color:var(--good);">●</span>' : '';

    if (s.id === editingId) {
      return `<tr class="${isActive ? 'active-row' : ''}">
        <td style="width:20px;">${dot}</td>
        <td colspan="2"><input class="edit-input" type="text" style="width:100%;"
          value="${escapeHtml(s.name)}" data-edit-field></td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn-icon save" data-action="save">✓ Save</button>
          <button class="btn-icon" data-action="cancel">Cancel</button>
        </td>
      </tr>`;
    }

    return `<tr class="${isActive ? 'active-row' : ''}">
      <td style="width:20px;">${dot}</td>
      <td style="font-weight:600;cursor:pointer;" data-action="switch" data-id="${s.id}">${escapeHtml(s.name)}</td>
      <td style="color:var(--ink-muted);font-family:'JetBrains Mono',monospace;">${s.students.length} students</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn-icon edit" data-action="edit" data-id="${s.id}">✎ Edit</button>
        <button class="btn-icon danger" data-action="remove" data-id="${s.id}">✕ Delete</button>
      </td>
    </tr>`;
  }).join('');
}
