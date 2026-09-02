/**
 * CSV import — read a roster or a filled-in grade matrix into a given term.
 *
 * Split in two so the UI can preview before touching state:
 *   planImport(subject, termKey, text) -> a plan object, no mutation
 *   applyImport(subject, plan)          -> performs the mutation
 *
 * (Grade export lives in xlsx.js — the client's class-record format.)
 */
import { uid } from './utils.js';

/** Parse CSV text into rows of string cells. Handles quotes, commas, CRLF. */
export function parseCsv(text) {
  const s = String(text).replace(/\r\n?/g, '\n');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  return rows.filter(r => r.some(f => f.trim() !== ''));
}

/* ---------- import ---------- */

/**
 * Work out what an import would do, without changing anything.
 *
 * Single column (or a lone "Student"/"Name" header) -> roster: every name
 * becomes a student. Otherwise -> matrix: row 0 is `Student` plus assignment
 * names for the given term; each cell is a score, blank (skip), or EXC.
 * Students are matched by name (case-insensitive) and created when missing;
 * assignment columns with no name match in that term are reported as skipped.
 */
export function planImport(subject, termKey, text) {
  const rows = parseCsv(text);
  const plan = {
    mode: 'empty',
    termKey,
    newStudents: [],
    scoreUpdates: [],
    skippedColumns: [],
    matchedColumns: 0
  };
  if (!rows.length) return plan;

  const width = Math.max(...rows.map(r => r.length));
  const headerFirst = (rows[0][0] || '').trim().toLowerCase();
  const rosterHeader = ['student', 'students', 'name'].includes(headerFirst);

  const known = new Set(subject.students.map(s => s.name.toLowerCase()));
  const seenNew = new Set();
  const noteName = name => {
    const key = name.toLowerCase();
    if (!known.has(key) && !seenNew.has(key)) {
      seenNew.add(key);
      plan.newStudents.push(name);
    }
  };

  if (width === 1) {
    plan.mode = 'roster';
    for (const r of rosterHeader ? rows.slice(1) : rows) {
      const name = (r[0] || '').trim();
      if (name) noteName(name);
    }
    return plan;
  }

  plan.mode = 'matrix';
  const assignments = subject.terms[termKey].assignments;
  const header = rows[0];
  const cols = [];
  for (let c = 1; c < header.length; c++) {
    const aName = (header[c] || '').trim();
    if (!aName) continue;
    const a = assignments.find(x => x.name.toLowerCase() === aName.toLowerCase());
    if (a) { cols.push({ c, assignmentId: a.id }); plan.matchedColumns++; }
    else plan.skippedColumns.push(aName);
  }

  for (let r = 1; r < rows.length; r++) {
    const name = (rows[r][0] || '').trim();
    if (!name) continue;
    noteName(name);
    for (const { c, assignmentId } of cols) {
      const raw = (rows[r][c] || '').trim();
      if (raw === '') continue;
      if (/^exc/i.test(raw)) {
        plan.scoreUpdates.push({ name, assignmentId, score: null, excused: true });
      } else {
        const num = parseFloat(raw);
        if (!isNaN(num)) {
          plan.scoreUpdates.push({ name, assignmentId, score: Math.max(0, num), excused: false });
        }
      }
    }
  }
  return plan;
}

/** Apply a plan from planImport(). Returns a small summary. */
export function applyImport(subject, plan) {
  for (const name of plan.newStudents) {
    subject.students.push({ id: uid(), name });
  }
  const byName = new Map(subject.students.map(s => [s.name.toLowerCase(), s]));
  let scoresSet = 0;
  for (const u of plan.scoreUpdates) {
    const st = byName.get(u.name.toLowerCase());
    if (!st) continue;
    subject.scores[st.id + '_' + u.assignmentId] = { score: u.score, excused: u.excused };
    scoresSet++;
  }
  return { addedStudents: plan.newStudents.length, scoresSet };
}
