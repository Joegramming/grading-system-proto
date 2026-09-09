/**
 * Class-record .xlsx — export and (round-trip) import.
 *
 * Layout:
 *   A1..A9      code / name / semester / school year / schedule / set /
 *               course & year / instructor / program chair
 *   row 11      PERIOD label (PRELIMS / MIDTERMS / FINALS), merged per block
 *   row 12      category name, merged across that category's columns
 *   row 13      assignment name, one per raw-score column
 *   row 14      assignment date (blank if none)
 *   row 15      max points per raw column; weight (decimal) in each Wtd column
 *   row 16+     one student per row, name in column A
 *
 * Per category:  raw₁…rawₙ → Total (=SUM) → % → Wtd (=% × weight)
 *   %  = Total * 50 / (Σ max of the cells the student actually has) + 50
 * Period grade  = Σ of that period's Wtd columns
 * Final grade   = (Prelim + Midterm + Final) / 3
 * All computed cells are live Excel formulas; on import they're ignored and the
 * app recomputes. Re-import does not recover the "excused" flag (excused cells
 * export blank, and blank imports as "not graded yet").
 */
import ExcelJS from 'exceljs/dist/exceljs.min.js';
import { TERMS, TERM_LABELS } from './state.js';
import { uid } from './utils.js';

const COURSE_LINES = [
  'code', 'name', 'semester', 'schoolYear', 'schedule', 'set',
  'courseYear', 'instructor', 'programChair'
];

const R_PERIOD = 11;
const R_CATEGORY = 12;
const R_NAME = 13;
const R_DATE = 14;
const R_MAXWT = 15;
const R_STU = 16;

function colLetter(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = (n - m - 1) / 26;
  }
  return s;
}

function colNum(s) {
  let n = 0;
  for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/* ------------------------------------------------------------------ export */

export async function buildClassRecordBlob(subject) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gradebook';
  wb.calcProperties.fullCalcOnLoad = true;

  const ws = wb.addWorksheet('Class Record', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: R_MAXWT }]
  });

  COURSE_LINES.forEach((key, i) => {
    const cell = ws.getCell(i + 1, 1);
    cell.value = subject.course[key] || '';
    cell.font = { bold: i < 2 };
  });

  ws.getCell(R_MAXWT, 1).value = 'STUDENT';
  ws.getColumn(1).width = 26;

  const students = subject.students;
  const lastRow = R_STU + Math.max(students.length, 1) - 1;
  students.forEach((s, i) => { ws.getCell(R_STU + i, 1).value = s.name; });

  let col = 2;
  const periodGradeCols = [];

  for (const termKey of TERMS) {
    const term = subject.terms[termKey];
    const periodStart = col;
    const cats = term.categories.filter(c => term.assignments.some(a => a.categoryId === c.id));
    const weightedCols = [];

    for (const cat of cats) {
      const catAssigns = term.assignments.filter(a => a.categoryId === cat.id);
      const rawStart = col;
      for (const a of catAssigns) {
        ws.getCell(R_NAME, col).value = a.name;
        if (a.date) ws.getCell(R_DATE, col).value = a.date;
        ws.getCell(R_MAXWT, col).value = Number(a.max);
        students.forEach((s, i) => {
          const e = subject.scores[s.id + '_' + a.id];
          if (e && !e.excused && e.score !== null && e.score !== undefined) {
            ws.getCell(R_STU + i, col).value = Number(e.score);
          }
        });
        col++;
      }
      const rawStartL = colLetter(rawStart);
      const rawEndL = colLetter(col - 1);

      const totalCol = col++;
      const pctCol = col++;
      const wtCol = col++;
      const totalL = colLetter(totalCol);
      const pctL = colLetter(pctCol);
      const wtL = colLetter(wtCol);

      ws.getCell(R_NAME, totalCol).value = 'Total';
      ws.getCell(R_NAME, pctCol).value = '%';
      ws.getCell(R_NAME, wtCol).value = 'Wtd';
      const wtCell = ws.getCell(R_MAXWT, wtCol);
      wtCell.value = Number(cat.weight) / 100;
      wtCell.numFmt = '0.00';
      weightedCols.push(wtL);

      ws.mergeCells(R_CATEGORY, rawStart, R_CATEGORY, wtCol);
      ws.getCell(R_CATEGORY, rawStart).value = cat.name;

      for (let r = R_STU; r <= lastRow; r++) {
        const countedMax =
          `SUMPRODUCT((${rawStartL}${r}:${rawEndL}${r}<>"")*($${rawStartL}$${R_MAXWT}:$${rawEndL}$${R_MAXWT}))`;
        ws.getCell(r, totalCol).value = { formula: `SUM(${rawStartL}${r}:${rawEndL}${r})` };
        ws.getCell(r, pctCol).value = {
          formula: `IF(${countedMax}=0,"",${totalL}${r}*50/${countedMax}+50)`
        };
        ws.getCell(r, wtCol).value = {
          formula: `IF(${pctL}${r}="","",${pctL}${r}*$${wtL}$${R_MAXWT})`
        };
        ws.getCell(r, pctCol).numFmt = '0.00';
        ws.getCell(r, wtCol).numFmt = '0.00';
      }
    }

    const pgCol = col++;
    const pgL = colLetter(pgCol);
    ws.getCell(R_NAME, pgCol).value = `${TERM_LABELS[termKey].toUpperCase()} GRADE`;
    for (let r = R_STU; r <= lastRow; r++) {
      const cell = ws.getCell(r, pgCol);
      cell.value = weightedCols.length
        ? { formula: weightedCols.map(l => `${l}${r}`).join('+') }
        : null;
      cell.numFmt = '0.00';
    }
    periodGradeCols.push(pgL);

    ws.mergeCells(R_PERIOD, periodStart, R_PERIOD, pgCol);
    ws.getCell(R_PERIOD, periodStart).value = TERM_LABELS[termKey].toUpperCase();
  }

  const fgCol = col++;
  const fgL = colLetter(fgCol);
  ws.getCell(R_NAME, fgCol).value = 'FINAL GRADE';
  const [p, m, f] = periodGradeCols;
  for (let r = R_STU; r <= lastRow; r++) {
    const cell = ws.getCell(r, fgCol);
    cell.value = {
      formula: `IF(OR(${p}${r}="",${m}${r}="",${f}${r}=""),"",(${p}${r}+${m}${r}+${f}${r})/3)`
    };
    cell.numFmt = '0.00';
  }

  const ltCol = col++;
  ws.getCell(R_NAME, ltCol).value = 'LETTER';
  for (let r = R_STU; r <= lastRow; r++) {
    ws.getCell(r, ltCol).value = {
      formula: `IF(${fgL}${r}="","",IF(${fgL}${r}>=90,"A",IF(${fgL}${r}>=80,"B",IF(${fgL}${r}>=70,"C",IF(${fgL}${r}>=60,"D","F")))))`
    };
  }

  for (const rr of [R_PERIOD, R_CATEGORY, R_NAME, R_DATE, R_MAXWT]) {
    const row = ws.getRow(rr);
    row.font = { bold: true };
    row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

/* ------------------------------------------------------------------ import */

function cellText(ws, r, c) {
  const v = ws.getCell(r, c).value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.result !== undefined && v.result !== null) return String(v.result).trim();
    if (v.text) return String(v.text).trim();
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('').trim();
    return '';
  }
  return String(v).trim();
}

function cellNum(ws, r, c) {
  const v = ws.getCell(r, c).value;
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && typeof v.result === 'number') return v.result;
  const n = parseFloat(cellText(ws, r, c));
  return isNaN(n) ? null : n;
}

function parseMerges(ws) {
  const raw = ws.model && ws.model.merges ? ws.model.merges : [];
  return raw.map(range => {
    const [a, b] = range.split(':');
    const ma = a.match(/([A-Z]+)(\d+)/);
    const mb = (b || a).match(/([A-Z]+)(\d+)/);
    return {
      left: colNum(ma[1]), top: +ma[2],
      right: colNum(mb[1]), bottom: +mb[2]
    };
  });
}

const TERM_BY_LABEL = {
  PRELIM: 'prelims', PRELIMS: 'prelims',
  MIDTERM: 'midterms', MIDTERMS: 'midterms',
  FINAL: 'finals', FINALS: 'finals'
};

/**
 * Rebuild a subject object from a class-record .xlsx (an ArrayBuffer).
 * Throws if the sheet doesn't look like one of ours.
 */
export async function parseClassRecord(arrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);
  const ws = wb.getWorksheet('Class Record') || wb.worksheets[0];
  if (!ws) throw new Error('The file has no worksheet.');

  const course = {};
  COURSE_LINES.forEach((key, i) => { course[key] = cellText(ws, i + 1, 1); });

  const students = [];
  for (let r = R_STU; r < R_STU + 5000; r++) {
    const name = cellText(ws, r, 1);
    if (!name) break;
    students.push({ id: uid(), name });
  }

  const merges = parseMerges(ws);
  const mergeAt = (row, col) =>
    merges.find(mg => row >= mg.top && row <= mg.bottom && col >= mg.left && col <= mg.right);

  const terms = {
    prelims: { categories: [], assignments: [] },
    midterms: { categories: [], assignments: [] },
    finals: { categories: [], assignments: [] }
  };
  const scores = {};

  const maxCol = Math.max(ws.actualColumnCount || 0, ws.columnCount || 0, 2) + 4;
  let c = 2;
  while (c <= maxCol) {
    const pm = mergeAt(R_PERIOD, c);
    const labelCol = pm ? pm.left : c;
    const label = cellText(ws, R_PERIOD, labelCol).toUpperCase().replace(/\s*GRADE$/, '').trim();
    const termKey = TERM_BY_LABEL[label];
    if (!termKey) { c++; continue; }
    const periodRight = pm ? pm.right : c;

    let cc = labelCol;
    while (cc <= periodRight) {
      const cm = mergeAt(R_CATEGORY, cc);
      if (!cm) { cc++; continue; } // e.g. the "<PERIOD> GRADE" column has no category merge
      const catName = cellText(ws, R_CATEGORY, cm.left) || 'Category';
      const wtCol = cm.right;                 // block = raw… | Total | % | Wtd
      const rawStart = cm.left;
      const rawEnd = cm.right - 3;
      const weightDec = cellNum(ws, R_MAXWT, wtCol);

      const category = {
        id: uid(),
        name: catName,
        weight: weightDec != null ? Math.round(weightDec * 100) : 0
      };
      terms[termKey].categories.push(category);

      for (let rc = rawStart; rc <= rawEnd; rc++) {
        const assignment = {
          id: uid(),
          name: cellText(ws, R_NAME, rc) || `Item ${rc}`,
          categoryId: category.id,
          max: cellNum(ws, R_MAXWT, rc) || 100,
          date: cellText(ws, R_DATE, rc)
        };
        terms[termKey].assignments.push(assignment);
        students.forEach((s, i) => {
          const val = cellNum(ws, R_STU + i, rc);
          if (val !== null) scores[s.id + '_' + assignment.id] = { score: val, excused: false };
        });
      }
      cc = cm.right + 1;
    }
    c = periodRight + 1;
  }

  const assignmentCount = TERMS.reduce((n, t) => n + terms[t].assignments.length, 0);
  if (!students.length && !assignmentCount) {
    throw new Error("This doesn't look like a Gradebook class record.");
  }

  return { id: uid(), course, students, terms, scores };
}
