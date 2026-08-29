import { getActiveSection, scheduleSave } from './state.js';
import { requestRender } from './bus.js';
import { showToast } from './utils.js';
import { confirmAction } from './dialog.js';
import { buildMatrixCsv, buildReportCsv, planImport, applyImport } from './csv.js';

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(name) {
  return (name || 'section')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'section';
}

export function initPortIO() {
  document.getElementById('exportMatrixBtn').addEventListener('click', () => {
    const active = getActiveSection();
    if (!active) return;
    if (!active.students.length || !active.assignments.length) {
      showToast('Add students and assignments first');
      return;
    }
    const name = `${slug(active.name)}-grades.csv`;
    download(name, buildMatrixCsv(active));
    showToast(`Exported ${name}`);
  });

  document.getElementById('exportReportBtn').addEventListener('click', () => {
    const active = getActiveSection();
    if (!active) return;
    if (!active.students.length) {
      showToast('Add students first');
      return;
    }
    const name = `${slug(active.name)}-report.csv`;
    download(name, buildReportCsv(active));
    showToast(`Exported ${name}`);
  });

  const fileInput = document.getElementById('importCsvInput');
  document.getElementById('importCsvBtn').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = ''; // let the same file be re-picked later
    if (!file) return;

    const active = getActiveSection();
    if (!active) return;

    let plan;
    try {
      plan = planImport(active, await file.text());
    } catch (e) {
      console.error('CSV import failed', e);
      showToast('Could not read that CSV');
      return;
    }

    if (plan.mode === 'empty') {
      showToast('That file looked empty');
      return;
    }

    const lines = [`Import into "${active.name}":`];
    lines.push(`• ${plan.newStudents.length} new student${plan.newStudents.length === 1 ? '' : 's'}`);
    if (plan.mode === 'matrix') {
      lines.push(`• ${plan.scoreUpdates.length} score${plan.scoreUpdates.length === 1 ? '' : 's'} across ${plan.matchedColumns} assignment${plan.matchedColumns === 1 ? '' : 's'}`);
      if (plan.skippedColumns.length) {
        lines.push(`• ${plan.skippedColumns.length} column${plan.skippedColumns.length === 1 ? '' : 's'} skipped — no matching assignment: ${plan.skippedColumns.join(', ')}`);
      }
    }

    const ok = await confirmAction({
      title: 'Apply these changes?',
      messageLines: lines,
      confirmLabel: 'Import now',
      cancelLabel: 'Cancel'
    });
    if (!ok) return;

    const summary = applyImport(active, plan);
    scheduleSave();
    requestRender();
    showToast(`Imported: +${summary.addedStudents} students, ${summary.scoresSet} scores`);
  });
}
