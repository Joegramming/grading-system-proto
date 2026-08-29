import { getActiveSection, scheduleSave } from './state.js';
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
  const active = getActiveSection();
  const nameInput = document.getElementById('catNameInput');
  const weightInput = document.getElementById('catWeightInput');
  const name = nameInput.value.trim();
  const weight = parseFloat(weightInput.value);
  if (!name || isNaN(weight) || weight < 0 || !active) return;

  active.categories.push({ id: uid(), name, weight });
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
  const active = getActiveSection();
  const nameField = document.querySelector('#catList [data-edit-field="name"]');
  const weightField = document.querySelector('#catList [data-edit-field="weight"]');
  if (!active || !nameField || !weightField) return;
  const name = nameField.value.trim();
  const weight = parseFloat(weightField.value);
  if (!name) { nameField.focus(); return; }
  if (isNaN(weight) || weight < 0) { weightField.focus(); return; }
  const cat = active.categories.find(c => c.id === editingId);
  if (cat) { cat.name = name; cat.weight = weight; }
  editingId = null;
  scheduleSave('Category updated');
  requestRender();
}

async function removeCategory(id) {
  const active = getActiveSection();
  if (!active) return;
  const cat = active.categories.find(c => c.id === id);
  if (!cat) return;

  // Removing a category takes its assignments — and their scores — with it.
  const removedAssignIds = active.assignments.filter(a => a.categoryId === id).map(a => a.id);

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

  active.categories = active.categories.filter(c => c.id !== id);
  active.assignments = active.assignments.filter(a => a.categoryId !== id);
  Object.keys(active.scores).forEach(k => {
    const assignmentId = k.split('_')[1];
    if (removedAssignIds.includes(assignmentId)) delete active.scores[k];
  });

  scheduleSave('Category deleted');
  requestRender();
}

export function renderCategories() {
  const active = getActiveSection();
  const tbody = document.getElementById('catList');
  tbody.innerHTML = '';
  if (!active) return;

  tbody.innerHTML = active.categories.map((c, i) => {
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

  document.getElementById('catEmpty').style.display = active.categories.length ? 'none' : 'block';

  renderWeightBar(active);
}

function renderWeightBar(active) {
  const bar = document.getElementById('weightBar');
  const legend = document.getElementById('weightLegend');
  const total = active.categories.reduce((sum, c) => sum + Number(c.weight || 0), 0);

  bar.innerHTML = active.categories.map((c, i) => {
    const width = total > 0 ? (c.weight / total * 100) : 0;
    return `<div class="weight-seg" style="width:${width}%;background:${categoryColor(i)};"></div>`;
  }).join('');

  legend.innerHTML = active.categories.map((c, i) =>
    `<span><span class="dot" style="background:${categoryColor(i)}"></span>${escapeHtml(c.name)} ${c.weight}%</span>`
  ).join('');

  const warn = document.getElementById('weightWarn');
  if (active.categories.length && total !== 100) {
    warn.style.display = 'block';
    warn.textContent = `Weights total ${total}% — adjust so categories add up to 100%.`;
  } else {
    warn.style.display = 'none';
  }
}
