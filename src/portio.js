import {
  state, getActiveSubject, semesterOf, createSemester, semesterLabel,
  subjectLabel, reconcileState, scheduleSave, TERMS, TERM_LABELS
} from './state.js';
import { requestRender } from './bus.js';
import { showToast } from './utils.js';
import { confirmAction } from './dialog.js';
import { planImport, applyImport } from './csv.js';

function downloadBlob(filename, blob) {
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
  return (name || 'subject')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'subject';
}

export function initPortIO() {
  document.getElementById('exportXlsxBtn').addEventListener('click', async () => {
    const subject = getActiveSubject();
    if (!subject) return;
    if (!subject.students.length) {
      showToast('Add students first', 'error');
      return;
    }
    showToast('Building the Excel file…');
    try {
      const { buildClassRecordBlob } = await import('./xlsx.js');
      const blob = await buildClassRecordBlob(subject, semesterOf(subject));
      const name = `${slug(subjectLabel(subject))}-class-record.xlsx`;
      downloadBlob(name, blob);
      showToast(`Exported ${name}`);
    } catch (e) {
      console.error('Excel export failed', e);
      showToast('Could not build the Excel file', 'error');
    }
  });

  document.getElementById('exportWordBtn').addEventListener('click', async () => {
    const subject = getActiveSubject();
    if (!subject) return;
    if (!subject.students.length) {
      showToast('Add students first', 'error');
      return;
    }
    showToast('Building the Word file…');
    try {
      const { buildGradeSheetBlob } = await import('./gradesheet.js');
      const blob = await buildGradeSheetBlob(subject, semesterOf(subject));
      const name = `${slug(subjectLabel(subject))}-grade-sheet.docx`;
      downloadBlob(name, blob);
      showToast(`Exported ${name}`);
    } catch (e) {
      console.error('Word export failed', e);
      showToast('Could not build the Word file', 'error');
    }
  });

  const fileInput = document.getElementById('importCsvInput');
  document.getElementById('importCsvBtn').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = ''; // let the same file be re-picked later
    if (!file) return;

    if (/\.xlsx$/i.test(file.name)) {
      await importClassRecord(file);
      return;
    }

    const subject = getActiveSubject();
    if (!subject) {
      showToast('Select or create a subject first', 'error');
      return;
    }
    const termKey = state.activeTerm;

    let plan;
    try {
      plan = planImport(subject, termKey, await file.text());
    } catch (e) {
      console.error('CSV import failed', e);
      showToast('Could not read that CSV', 'error');
      return;
    }

    if (plan.mode === 'empty') {
      showToast('That file looked empty', 'error');
      return;
    }

    const lines = [`Import into ${subjectLabel(subject)} — ${TERM_LABELS[termKey]}:`];
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

    const summary = applyImport(subject, plan);
    scheduleSave();
    requestRender();
    showToast(`Imported: +${summary.addedStudents} students, ${summary.scoresSet} scores`);
  });
}

/** Rebuild a whole subject from an exported class-record .xlsx. */
async function importClassRecord(file) {
  showToast('Reading the Excel file…');
  let draft;
  try {
    const { parseClassRecord } = await import('./xlsx.js');
    draft = await parseClassRecord(await file.arrayBuffer());
  } catch (e) {
    console.error('Class-record import failed', e);
    showToast(e.message || 'Could not read that Excel file', 'error');
    return;
  }

  const hint = draft.semesterHint || { label: '', schoolYear: '' };
  delete draft.semesterHint;

  // find or create the semester this record belongs to (blanks -> "Unsorted")
  const sy = hint.schoolYear || 'Unsorted';
  const lb = hint.label || 'Unsorted';
  let sem = state.semesters.find(s => s.schoolYear === sy && s.label === lb);
  const createdSem = !sem;
  if (!sem) {
    sem = createSemester({ schoolYear: sy, label: lb });
    state.semesters.push(sem);
  }
  draft.semesterId = sem.id;

  const nStu = draft.students.length;
  const nAsg = TERMS.reduce((n, t) => n + draft.terms[t].assignments.length, 0);
  const nScore = Object.keys(draft.scores).length;

  const ok = await confirmAction({
    title: 'Import this class record?',
    messageLines: [
      `Creates a new subject: ${subjectLabel(draft)}`,
      `Semester: ${semesterLabel(sem)}`,
      `• ${nStu} student${nStu === 1 ? '' : 's'}`,
      `• ${nAsg} assignment${nAsg === 1 ? '' : 's'} across the 3 terms`,
      `• ${nScore} score${nScore === 1 ? '' : 's'}`,
      'Excused marks are not restored — blank cells import as "not graded yet".'
    ],
    confirmLabel: 'Create subject',
    cancelLabel: 'Cancel'
  });
  if (!ok) {
    if (createdSem) state.semesters = state.semesters.filter(s => s.id !== sem.id);
    return;
  }

  state.subjects.push(draft);
  state.activeSemesterId = sem.id;
  state.activeSubjectId = draft.id;
  reconcileState();
  scheduleSave('Class record imported');
  requestRender();
  showToast(`Imported ${subjectLabel(draft)} — ${nStu} students`);
}
