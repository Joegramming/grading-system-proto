import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildClassRecordBlob } from './xlsx.js';

function subject() {
  const cat = (id, name, weight) => ({ id, name, weight });
  const asg = (id, name, categoryId, max, date) => ({ id, name, categoryId, max, date });
  return {
    id: 'sub1',
    course: {
      code: 'ITP 112', name: 'SYSTEMS ANALYSIS AND DESIGN', semester: 'SECOND SEMESTER',
      schoolYear: 'SY 2025-2026', schedule: 'TTH 3:30-5:30', set: 'SET A'
    },
    students: [{ id: 's1', name: 'AGUSTIN, EIAN' }, { id: 's2', name: 'ALON, MARLON' }],
    terms: {
      prelims: {
        categories: [cat('c1', 'Class Standing', 40), cat('c2', 'Exam', 60)],
        assignments: [
          asg('a1', 'Attendance', 'c1', 10, '1/12'),
          asg('a2', 'Recitation', 'c1', 10, ''),
          asg('a3', 'Prelim Exam', 'c2', 75, '')
        ]
      },
      midterms: { categories: [], assignments: [] },
      finals: { categories: [], assignments: [] }
    },
    scores: { s1_a1: { score: 9, excused: false }, s1_a3: { score: 60, excused: false } }
  };
}

async function readBack(blob) {
  const buf = Buffer.from(await blob.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.getWorksheet('Class Record');
}

describe('buildClassRecordBlob', () => {
  it('writes the A1:A6 course block', async () => {
    const ws = await readBack(await buildClassRecordBlob(subject()));
    expect(ws.getCell('A1').value).toBe('ITP 112');
    expect(ws.getCell('A2').value).toBe('SYSTEMS ANALYSIS AND DESIGN');
    expect(ws.getCell('A6').value).toBe('SET A');
    expect(ws.getCell('A11').value).toBe('STUDENT');
    expect(ws.getCell('A12').value).toBe('AGUSTIN, EIAN');
  });

  it('lays out raw columns with assignment name-or-date and max, plus live formulas', async () => {
    const ws = await readBack(await buildClassRecordBlob(subject()));

    // Prelims: 2 raw (B,C) + Total D + % E + Wtd F for Class Standing,
    //          1 raw (G) + Total H + % I + Wtd J for Exam, then PRELIM GRADE K.
    expect(ws.getCell('B10').value).toBe('1/12');       // has a date
    expect(ws.getCell('C10').value).toBe('Recitation'); // no date -> name
    expect(ws.getCell('B11').value).toBe(10);           // max
    expect(ws.getCell('G11').value).toBe(75);
    expect(ws.getCell('F11').value).toBeCloseTo(0.4);   // weight decimal
    expect(ws.getCell('J11').value).toBeCloseTo(0.6);

    // student scores are written into the raw cells
    expect(ws.getCell('B12').value).toBe(9);   // s1 Attendance
    expect(ws.getCell('C12').value).toBeNull(); // s1 Recitation not graded
    expect(ws.getCell('G12').value).toBe(60);  // s1 Prelim Exam

    const total = ws.getCell('D12').value;
    expect(total.formula).toBe('SUM(B12:C12)');

    const pct = ws.getCell('E12').value;
    expect(pct.formula).toContain('SUMPRODUCT');
    expect(pct.formula).toContain('*50/');

    const grade = ws.getCell('K12').value;    // PRELIM GRADE = F + J
    expect(grade.formula).toBe('F12+J12');

    const finalCell = ws.getCell('N12').value; // after 3 period-grade cols K,L,M
    expect(finalCell.formula).toContain('/3');
  });
});
