import { getActiveSubject, getActiveTermData, scheduleSave } from './state.js';
import { requestRender } from './bus.js';
import { uid, escapeHtml } from './utils.js';
import { confirmAction } from './dialog.js';

export const COLORS = ['#c3e85a', '#7aa6d6', '#eea23f', '#c19be0', '#7fd6b0', '#e08a9b'];

export function categoryColor(index) {
  return COLORS[index % COLORS.length];
}

let editingId = null;

export function initCategories() {
  document.getElementById('addCatBtn').addEventListener('click', addCategory);
  document.getElementById('catNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addCategory();
  });
  document.getElementById('catWeightInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addCategory();
  });

  const list = document.getElementById('catList');
  list.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, id } = el.dataset;
    if (action === 'edit') startEdit(id);
    if (action === 'save') commitEdit();
    if (action === 'cancel') cancelEdit();
    if (action === 'remove') removeCategory(id);
  });
  list.addEventListener('keydown', e => {
    if (!editingId) return;
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  });
}

function addCategory() {
  const term = getActiveTermData();
  const nameInput = document.getElementById('catNameInput');
  const weightInput = document.getElementById('catWeightInput');
  const name = nameInput.value.trim();
  const weight = parseFloat(weightInput.value);
  if (!name || isNaN(weight) || weight < 0 || !term) return;

  term.categories.push({ id: uid(), name, weight });
  nameInput.value = '';
  weightInput.value = '';
  scheduleSave('Category added');
  requestRender();
}

function startEdit(id) {
  editingId = id;
  requestRender();
  const field = document.querySelector('#catList [data-edit-field="name"]');
  if (field) { field.focus(); field.select(); }
}

function cancelEdit() {
  editingId = null;
  requestRender();
}

function commitEdit() {
  const term = getActiveTermData();
  const nameField = document.querySelector('#catList [data-edit-field="name"]');
  const weightField = document.querySelector('#catList [data-edit-field="weight"]');
  if (!term || !nameField || !weightField) return;
  const name = nameField.value.trim();
  const weight = parseFloat(weightField.value);
  if (!name) { nameField.focus(); return; }
  if (isNaN(weight) || weight < 0) { weightField.focus(); return; }
  const cat = term.categories.find(c => c.id === editingId);
  if (cat) { cat.name = name; cat.weight = weight; }
  editingId = null;
  scheduleSave('Category updated');
  requestRender();
}

async function removeCategory(id) {
  const term = getActiveTermData();
  const subject = getActiveSubject();
  if (!term || !subject) return;
  const cat = term.categories.find(c => c.id === id);
  if (!cat) return;

  // Removing a category takes its assignments — and their scores — with it.
  const removedAssignIds = term.assignments.filter(a => a.categoryId === id).map(a => a.id);

  const tail = removedAssignIds.length
    ? ` along with ${removedAssignIds.length} assignment${removedAssignIds.length === 1 ? '' : 's'} and their scores`
    : '';
  const ok = await confirmAction({
    title: 'Delete this category?',
    message: `Delete category "${cat.name}"${tail}? This can't be undone.`,
    confirmLabel: 'Delete category',
    cancelLabel: 'Keep it',
    tone: 'danger'
  });
  if (!ok) return;

  term.categories = term.categories.filter(c => c.id !== id);
  term.assignments = term.assignments.filter(a => a.categoryId !== id);
  Object.keys(subject.scores).forEach(k => {
    const assignmentId = k.split('_')[1];
    if (removedAssignIds.includes(assignmentId)) delete subject.scores[k];
  });

  scheduleSave('Category deleted');
  requestRender();
}

export function renderCategories() {
  const term = getActiveTermData();
  const tbody = document.getElementById('catList');
  const emptyEl = document.getElementById('catEmpty');
  tbody.innerHTML = '';

  if (!term) {
    document.getElementById('weightBar').innerHTML = '';
    document.getElementById('weightLegend').innerHTML = '';
    document.getElementById('weightWarn').style.display = 'none';
    emptyEl.style.display = 'block';
    emptyEl.textContent = 'Add a subject first, then set up categories for each term.';
    return;
  }

  tbody.innerHTML = term.categories.map((c, i) => {
    const color = categoryColor(i);
    if (c.id === editingId) {
      return `<tr>
        <td><input class="edit-input" type="text" value="${escapeHtml(c.name)}" data-edit-field="name"></td>
        <td><input class="edit-input" type="number" min="0" max="100" style="width:80px;" value="${c.weight}" data-edit-field="weight">%</td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn-icon save" data-action="save">✓ Save</button>
          <button class="btn-icon" data-action="cancel">Cancel</button>
        </td>
      </tr>`;
    }
    return `<tr>
      <td><span class="pill" style="color:${color};border:1px solid ${color}55;">${escapeHtml(c.name)}</span></td>
      <td style="font-family:'JetBrains Mono',monospace;">${c.weight}%</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn-icon edit" data-action="edit" data-id="${c.id}">✎ Edit</button>
        <button class="btn-icon danger" data-action="remove" data-id="${c.id}">✕ Delete</button>
      </td>
    </tr>`;
  }).join('');

  emptyEl.style.display = term.categories.length ? 'none' : 'block';
  emptyEl.textContent = 'No categories yet — e.g. Quizzes 20%, Essays 30%, Projects 30%, Exams 20%.';

  renderWeightBar(term);
}

function renderWeightBar(term) {
  const bar = document.getElementById('weightBar');
  const legend = document.getElementById('weightLegend');
  const total = term.categories.reduce((sum, c) => sum + Number(c.weight || 0), 0);

  bar.innerHTML = term.categories.map((c, i) => {
    const width = total > 0 ? (c.weight / total * 100) : 0;
    return `<div class="weight-seg" style="width:${width}%;background:${categoryColor(i)};"></div>`;
  }).join('');

  legend.innerHTML = term.categories.map((c, i) =>
    `<span><span class="dot" style="background:${categoryColor(i)}"></span>${escapeHtml(c.name)} ${c.weight}%</span>`
  ).join('');

  const warn = document.getElementById('weightWarn');
  if (term.categories.length && total !== 100) {
    warn.style.display = 'block';
    warn.textContent = `Weights total ${total}% — adjust so categories add up to 100%.`;
  } else {
    warn.style.display = 'none';
  }
}
