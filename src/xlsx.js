/**
 * Class-record .xlsx export — mirrors the client's template:
 *
 *   A1:A6        course code / name / semester / school year / schedule / set
 *   row 8        period label (PRELIM / MIDTERM / FINAL), merged per period block
 *   row 9        category name, merged across that category's columns
 *   row 10       assignment name (or its date), one per raw-score column
 *   row 11       max points per raw column; weight (decimal) in each Wtd column
 *   row 12+      one student per row, name in column A
 *
 * Per category:  raw₁…rawₙ  ->  Total (=SUM)  ->  %  ->  Wtd (=% × weight)
 *   %  = Total * 50 / (Σ max of the cells the student actually has) + 50
 *        (blank cells are excluded from the max, matching the app)
 * Period grade  = Σ of that period's Wtd columns
 * Final grade   = (Prelim + Midterm + Final) / 3, blank until all three exist
 *
 * All computed cells are live Excel formulas.
 */
import ExcelJS from 'exceljs/dist/exceljs.min.js';
import { TERMS, TERM_LABELS } from './state.js';

const COURSE_LINES = ['code', 'name', 'semester', 'schoolYear', 'schedule', 'set'];

function colLetter(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = (n - m - 1) / 26;
  }
  return s;
}

export async function buildClassRecordBlob(subject) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gradebook';
  wb.calcProperties.fullCalcOnLoad = true;

  const ws = wb.addWorksheet('Class Record', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 11 }]
  });

  const R_PERIOD = 8;
  const R_CATEGORY = 9;
  const R_ASSIGN = 10;
  const R_MAXWT = 11;
  const R_STU = 12;

  // Course header block, A1:A6
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
        ws.getCell(R_ASSIGN, col).value = a.date || a.name;
        ws.getCell(R_MAXWT, col).value = Number(a.max);
        // each student's actual score; excused / not-graded cells stay blank
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

      ws.getCell(R_ASSIGN, totalCol).value = 'Total';
      ws.getCell(R_ASSIGN, pctCol).value = '%';
      ws.getCell(R_ASSIGN, wtCol).value = 'Wtd';
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
    ws.getCell(R_ASSIGN, pgCol).value = `${TERM_LABELS[termKey].toUpperCase()} GRADE`;
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
  ws.getCell(R_ASSIGN, fgCol).value = 'FINAL GRADE';
  const [p, m, f] = periodGradeCols;
  for (let r = R_STU; r <= lastRow; r++) {
    const cell = ws.getCell(r, fgCol);
    cell.value = {
      formula: `IF(OR(${p}${r}="",${m}${r}="",${f}${r}=""),"",(${p}${r}+${m}${r}+${f}${r})/3)`
    };
    cell.numFmt = '0.00';
  }

  const ltCol = col++;
  ws.getCell(R_ASSIGN, ltCol).value = 'LETTER';
  for (let r = R_STU; r <= lastRow; r++) {
    ws.getCell(r, ltCol).value = {
      formula: `IF(${fgL}${r}="","",IF(${fgL}${r}>=90,"A",IF(${fgL}${r}>=80,"B",IF(${fgL}${r}>=70,"C",IF(${fgL}${r}>=60,"D","F")))))`
    };
  }

  for (const rr of [R_PERIOD, R_CATEGORY, R_ASSIGN, R_MAXWT]) {
    const row = ws.getRow(rr);
    row.font = { bold: true };
    row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}
