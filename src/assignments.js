import { getActiveSection, scheduleSave } from './state.js';
import { requestRender } from './bus.js';
import { uid, escapeHtml } from './utils.js';
import { confirmAction } from './dialog.js';

let editingId = null;

export function initAssignments() {
  document.getElementById('addAssignBtn').addEventListener('click', addAssignment);
  document.getElementById('assignNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addAssignment();
  });

  const list = document.getElementById('assignList');
  list.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, id } = el.dataset;
    if (action === 'edit') startEdit(id);
    if (action === 'save') commitEdit();
    if (action === 'cancel') cancelEdit();
    if (action === 'remove') removeAssignment(id);
  });
  list.addEventListener('keydown', e => {
    if (!editingId) return;
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  });
}

function addAssignment() {
  const active = getActiveSection();
  const nameInput = document.getElementById('assignNameInput');
  const maxInput = document.getElementById('assignMaxInput');
  const catSelect = document.getElementById('assignCatSelect');

  const name = nameInput.value.trim();
  const categoryId = catSelect.value;
  const max = parseFloat(maxInput.value) || 100;
  if (!name || !categoryId || !active) return;

  active.assignments.push({ id: uid(), name, categoryId, max });
  nameInput.value = '';
  scheduleSave('Assignment added');
  requestRender();
}

function startEdit(id) {
  editingId = id;
  requestRender();
  const field = document.querySelector('#assignList [data-edit-field="name"]');
  if (field) { field.focus(); field.select(); }
}

function cancelEdit() {
  editingId = null;
  requestRender();
}

function commitEdit() {
  const active = getActiveSection();
  const nameField = document.querySelector('#assignList [data-edit-field="name"]');
  const catField = document.querySelector('#assignList [data-edit-field="category"]');
  const maxField = document.querySelector('#assignList [data-edit-field="max"]');
  if (!active || !nameField || !catField || !maxField) return;
  const name = nameField.value.trim();
  const categoryId = catField.value;
  const max = parseFloat(maxField.value);
  if (!name) { nameField.focus(); return; }
  if (!categoryId) { catField.focus(); return; }
  if (isNaN(max) || max <= 0) { maxField.focus(); return; }
  const assign = active.assignments.find(a => a.id === editingId);
  if (assign) { assign.name = name; assign.categoryId = categoryId; assign.max = max; }
  editingId = null;
  scheduleSave('Assignment updated');
  requestRender();
}

async function removeAssignment(id) {
  const active = getActiveSection();
  if (!active) return;
  const assign = active.assignments.find(a => a.id === id);
  if (!assign) return;

  const scoreCount = Object.keys(active.scores).filter(k => k.endsWith('_' + id)).length;
  const tail = scoreCount ? ` and ${scoreCount} score${scoreCount === 1 ? '' : 's'}` : '';
  const ok = await confirmAction({
    title: 'Delete this assignment?',
    message: `Delete assignment "${assign.name}"${tail}? This can't be undone.`,
    confirmLabel: 'Delete assignment',
    cancelLabel: 'Keep it',
    tone: 'danger'
  });
  if (!ok) return;

  active.assignments = active.assignments.filter(a => a.id !== id);
  Object.keys(active.scores).forEach(k => {
    if (k.endsWith('_' + id)) delete active.scores[k];
  });
  scheduleSave('Assignment deleted');
  requestRender();
}

/** <option> list for a category <select>, optionally pre-selecting one. */
function categoryOptions(active, selectedId) {
  return active.categories
    .map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)
    .join('') || '<option value="">No categories yet</option>';
}

export function renderAssignments() {
  const active = getActiveSection();
  const tbody = document.getElementById('assignList');
  tbody.innerHTML = '';
  if (!active) return;

  tbody.innerHTML = active.assignments.map(a => {
    const cat = active.categories.find(c => c.id === a.categoryId);
    if (a.id === editingId) {
      return `<tr>
        <td><input class="edit-input" type="text" value="${escapeHtml(a.name)}" data-edit-field="name"></td>
        <td><select class="edit-input" data-edit-field="category">${categoryOptions(active, a.categoryId)}</select></td>
        <td><input class="edit-input" type="number" min="1" style="width:70px;" value="${a.max}" data-edit-field="max"></td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn-icon save" data-action="save">✓ Save</button>
          <button class="btn-icon" data-action="cancel">Cancel</button>
        </td>
      </tr>`;
    }
    return `<tr>
      <td>${escapeHtml(a.name)}</td>
      <td><span class="pill">${cat ? escapeHtml(cat.name) : '—'}</span></td>
      <td style="font-family:'JetBrains Mono',monospace;color:var(--ink-muted);">/ ${a.max}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn-icon edit" data-action="edit" data-id="${a.id}">✎ Edit</button>
        <button class="btn-icon danger" data-action="remove" data-id="${a.id}">✕ Delete</button>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('assignEmpty').style.display = active.assignments.length ? 'none' : 'block';

  renderCategoryOptions(active);
}

/** Keeps the "add assignment" category dropdown in sync with the categories list. */
function renderCategoryOptions(active) {
  const sel = document.getElementById('assignCatSelect');
  const previous = sel.value;
  sel.innerHTML = active.categories
    .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join('') || '<option value="">No categories yet</option>';
  // Keep the user's pick selected across re-renders when it still exists.
  if (previous && active.categories.some(c => c.id === previous)) sel.value = previous;
}
