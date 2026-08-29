/**
 * CSV round-tripping for a section: export the grade matrix or a report
 * summary, and import a roster or a filled-in grade matrix.
 *
 * Import is split in two so the UI can preview before touching state:
 *   planImport(section, text) -> a plan object, no mutation
 *   applyImport(section, plan) -> performs the mutation
 */
import { uid } from './utils.js';
import { computeStudentGrade, letterGrade } from './grading.js';

/* ---------- low-level CSV ---------- */

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

  // Drop rows that are entirely blank.
  return rows.filter(r => r.some(f => f.trim() !== ''));
}

/** Serialise rows (arrays of cells) to CSV text, quoting where needed. */
export function toCsv(rows) {
  return rows
    .map(r => r
      .map(cell => {
        const v = cell == null ? '' : String(cell);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      })
      .join(','))
    .join('\n');
}

/* ---------- export ---------- */

/** `Student, <assignment>, …` with raw scores, blank = ungraded, EXC = excused. */
export function buildMatrixCsv(section) {
  const header = ['Student', ...section.assignments.map(a => a.name)];
  const rows = [header];
  for (const st of section.students) {
    const row = [st.name];
    for (const a of section.assignments) {
      const e = section.scores[st.id + '_' + a.id];
      if (e && e.excused) row.push('EXC');
      else if (e && e.score !== null && e.score !== undefined) row.push(String(e.score));
      else row.push('');
    }
    rows.push(row);
  }
  return toCsv(rows);
}

/** `Student, Final %, Letter, <category> %, …` — mirrors the Reports page. */
export function buildReportCsv(section) {
  const header = ['Student', 'Final %', 'Letter', ...section.categories.map(c => c.name + ' %')];
  const rows = [header];
  for (const st of section.students) {
    const { final, catBreakdown } = computeStudentGrade(section, st.id);
    rows.push([
      st.name,
      final !== null ? final.toFixed(1) : '',
      letterGrade(final).letter,
      // catBreakdown is in the same order as section.categories.
      ...catBreakdown.map(b => (b.pct !== null ? b.pct.toFixed(1) : ''))
    ]);
  }
  return toCsv(rows);
}

/* ---------- import ---------- */

/**
 * Work out what an import would do, without changing anything.
 *
 * Single column (or a lone "Student"/"Name" header) -> roster: every name
 * becomes a student. Otherwise -> matrix: row 0 is `Student` plus assignment
 * names; each cell is a score, blank (skip), or EXC. Students are matched by
 * name (case-insensitive) and created when missing; assignment columns with no
 * name match in this section are reported as skipped.
 */
export function planImport(section, text) {
  const rows = parseCsv(text);
  const plan = {
    mode: 'empty',
    newStudents: [],
    scoreUpdates: [],
    skippedColumns: [],
    matchedColumns: 0
  };
  if (!rows.length) return plan;

  const width = Math.max(...rows.map(r => r.length));
  const headerFirst = (rows[0][0] || '').trim().toLowerCase();
  const rosterHeader = ['student', 'students', 'name'].includes(headerFirst);

  const known = new Set(section.students.map(s => s.name.toLowerCase()));
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
  const header = rows[0];
  const cols = [];
  for (let c = 1; c < header.length; c++) {
    const aName = (header[c] || '').trim();
    if (!aName) continue;
    const a = section.assignments.find(x => x.name.toLowerCase() === aName.toLowerCase());
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
export function applyImport(section, plan) {
  for (const name of plan.newStudents) {
    section.students.push({ id: uid(), name });
  }
  const byName = new Map(section.students.map(s => [s.name.toLowerCase(), s]));
  let scoresSet = 0;
  for (const u of plan.scoreUpdates) {
    const st = byName.get(u.name.toLowerCase());
    if (!st) continue;
    section.scores[st.id + '_' + u.assignmentId] = { score: u.score, excused: u.excused };
    scoresSet++;
  }
  return { addedStudents: plan.newStudents.length, scoresSet };
}
