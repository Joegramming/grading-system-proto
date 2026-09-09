import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildClassRecordBlob, parseClassRecord } from './xlsx.js';

function subject() {
  const cat = (id, name, weight) => ({ id, name, weight });
  const asg = (id, name, categoryId, max, date) => ({ id, name, categoryId, max, date });
  return {
    id: 'sub1',
    course: {
      code: 'ITP 112', name: 'SYSTEMS ANALYSIS AND DESIGN', semester: 'SECOND SEMESTER',
      schoolYear: 'SY 2025-2026', schedule: 'TTH 3:30-5:30', set: 'SET A',
      courseYear: 'BSIT II-B', instructor: 'HELEN S. DURIGUEZ', programChair: 'ENGR. ELIAS D. EDAN JR.'
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
  it('writes the A1:A9 course block and STUDENT header', async () => {
    const ws = await readBack(await buildClassRecordBlob(subject()));
    expect(ws.getCell('A1').value).toBe('ITP 112');
    expect(ws.getCell('A2').value).toBe('SYSTEMS ANALYSIS AND DESIGN');
    expect(ws.getCell('A6').value).toBe('SET A');
    expect(ws.getCell('A7').value).toBe('BSIT II-B');
    expect(ws.getCell('A9').value).toBe('ENGR. ELIAS D. EDAN JR.');
    expect(ws.getCell('A15').value).toBe('STUDENT');
    expect(ws.getCell('A16').value).toBe('AGUSTIN, EIAN');
  });

  it('separates assignment name (row 13) and date (row 14); max/weight on row 15', async () => {
    const ws = await readBack(await buildClassRecordBlob(subject()));
    expect(ws.getCell('B13').value).toBe('Attendance');
    expect(ws.getCell('C13').value).toBe('Recitation');
    expect(ws.getCell('B14').value).toBe('1/12');       // date row
    expect(ws.getCell('C14').value).toBeNull();          // no date
    expect(ws.getCell('B15').value).toBe(10);            // max
    expect(ws.getCell('G15').value).toBe(75);
    expect(ws.getCell('F15').value).toBeCloseTo(0.4);    // Class Standing weight
    expect(ws.getCell('J15').value).toBeCloseTo(0.6);    // Exam weight

    expect(ws.getCell('B16').value).toBe(9);             // s1 Attendance score
    expect(ws.getCell('C16').value).toBeNull();          // s1 Recitation ungraded
    expect(ws.getCell('D16').value.formula).toBe('SUM(B16:C16)');
    expect(ws.getCell('K16').value.formula).toBe('F16+J16');   // PRELIMS GRADE
    expect(ws.getCell('N16').value.formula).toContain('/3');   // FINAL GRADE
  });
});

describe('parseClassRecord — round-trip', () => {
  it('rebuilds course, students, categories, assignments and scores', async () => {
    const blob = await buildClassRecordBlob(subject());
    const draft = await parseClassRecord(await blob.arrayBuffer());

    expect(draft.course).toEqual(subject().course);
    expect(draft.students.map(s => s.name)).toEqual(['AGUSTIN, EIAN', 'ALON, MARLON']);

    const pcats = draft.terms.prelims.categories;
    expect(pcats.map(c => [c.name, c.weight])).toEqual([['Class Standing', 40], ['Exam', 60]]);

    const pasg = draft.terms.prelims.assignments;
    expect(pasg.map(a => [a.name, a.max, a.date])).toEqual([
      ['Attendance', 10, '1/12'],
      ['Recitation', 10, ''],
      ['Prelim Exam', 75, '']
    ]);
    // assignments linked to the right (regenerated) category ids
    const csId = pcats.find(c => c.name === 'Class Standing').id;
    const exId = pcats.find(c => c.name === 'Exam').id;
    expect(pasg.find(a => a.name === 'Attendance').categoryId).toBe(csId);
    expect(pasg.find(a => a.name === 'Prelim Exam').categoryId).toBe(exId);

    expect(draft.terms.midterms.assignments).toEqual([]);
    expect(draft.terms.finals.categories).toEqual([]);

    // scores re-linked by the new ids
    const ada = draft.students.find(s => s.name === 'AGUSTIN, EIAN').id;
    const att = pasg.find(a => a.name === 'Attendance').id;
    const exam = pasg.find(a => a.name === 'Prelim Exam').id;
    expect(draft.scores[`${ada}_${att}`]).toEqual({ score: 9, excused: false });
    expect(draft.scores[`${ada}_${exam}`]).toEqual({ score: 60, excused: false });
    expect(Object.keys(draft.scores)).toHaveLength(2);
  });

  it('rejects a workbook that is not a class record', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Sheet1').getCell('A1').value = 'hello';
    const buf = await wb.xlsx.writeBuffer();
    await expect(parseClassRecord(buf)).rejects.toThrow();
  });
});
