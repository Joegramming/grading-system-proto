import { describe, it, expect } from 'vitest';
import {
  parseCsv, toCsv, buildMatrixCsv, buildReportCsv, planImport, applyImport
} from './csv.js';

function section() {
  return {
    id: 'sec1',
    name: 'Block A',
    students: [{ id: 'stu_ada', name: 'Ada' }, { id: 'stu_bo', name: 'Bo' }],
    categories: [
      { id: 'c1', name: 'Quizzes', weight: 50 },
      { id: 'c2', name: 'Exams', weight: 50 }
    ],
    assignments: [
      { id: 'a1', name: 'Quiz 1', categoryId: 'c1', max: 10 },
      { id: 'a2', name: 'Midterm', categoryId: 'c2', max: 100 }
    ],
    scores: {
      stu_ada_a1: { score: 9, excused: false },
      stu_ada_a2: { score: 80, excused: false },
      stu_bo_a1: { score: null, excused: true }
    }
  };
}

describe('parseCsv', () => {
  it('parses plain rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('handles quoted fields with commas and quotes', () => {
    expect(parseCsv('"Doe, Jane","say ""hi"""')).toEqual([['Doe, Jane', 'say "hi"']]);
  });

  it('handles CRLF and drops blank lines', () => {
    expect(parseCsv('a\r\n\r\nb\r\n')).toEqual([['a'], ['b']]);
  });

  it('keeps embedded newlines inside quotes', () => {
    expect(parseCsv('"line1\nline2",x')).toEqual([['line1\nline2', 'x']]);
  });
});

describe('toCsv', () => {
  it('round-trips through parseCsv', () => {
    const rows = [['Student', 'Quiz 1'], ['Doe, Jane', '9'], ['Quote "x"', '']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe('buildMatrixCsv', () => {
  it('emits scores, blanks, and EXC', () => {
    expect(buildMatrixCsv(section())).toBe(
      'Student,Quiz 1,Midterm\n' +
      'Ada,9,80\n' +
      'Bo,EXC,'
    );
  });
});

describe('buildReportCsv', () => {
  it('emits final %, letter, and per-category %', () => {
    // Ada: Quizzes 9/10 = 90, Exams 80/100 = 80 -> 0.5*90 + 0.5*80 = 85 -> B
    // Bo: only an excused quiz -> nothing graded
    expect(buildReportCsv(section())).toBe(
      'Student,Final %,Letter,Quizzes %,Exams %\n' +
      'Ada,85.0,B,90.0,80.0\n' +
      'Bo,,—,,'
    );
  });
});

describe('planImport', () => {
  it('roster mode: single column of names, skips a Student header', () => {
    const plan = planImport(section(), 'Student\nAda\nCleo\nDara\n');
    expect(plan.mode).toBe('roster');
    expect(plan.newStudents).toEqual(['Cleo', 'Dara']); // Ada already exists
  });

  it('roster mode: de-dupes repeated new names case-insensitively', () => {
    const plan = planImport(section(), 'Cleo\ncleo\nCLEO');
    expect(plan.newStudents).toEqual(['Cleo']);
  });

  it('matrix mode: matches assignments, plans score updates, reports skipped columns', () => {
    const csv =
      'Student,Quiz 1,Homework 3,Midterm\n' +
      'Ada,10,5,95\n' +
      'Cleo,7,,EXC\n';
    const plan = planImport(section(), csv);

    expect(plan.mode).toBe('matrix');
    expect(plan.matchedColumns).toBe(2);
    expect(plan.skippedColumns).toEqual(['Homework 3']);
    expect(plan.newStudents).toEqual(['Cleo']);
    expect(plan.scoreUpdates).toEqual([
      { name: 'Ada', assignmentId: 'a1', score: 10, excused: false },
      { name: 'Ada', assignmentId: 'a2', score: 95, excused: false },
      { name: 'Cleo', assignmentId: 'a1', score: 7, excused: false },
      { name: 'Cleo', assignmentId: 'a2', score: null, excused: true }
    ]);
  });

  it('matrix mode: blank cells are left untouched, negatives clamp to 0', () => {
    const plan = planImport(section(), 'Student,Quiz 1\nAda,\nBo,-4');
    expect(plan.scoreUpdates).toEqual([
      { name: 'Bo', assignmentId: 'a1', score: 0, excused: false }
    ]);
  });

  it('returns an empty plan for empty input', () => {
    expect(planImport(section(), '   \n\n').mode).toBe('empty');
  });
});

describe('applyImport', () => {
  it('adds students and writes scores by matched name', () => {
    const sec = section();
    const plan = planImport(sec, 'Student,Quiz 1,Midterm\nAda,10,100\nCleo,6,70\n');
    const summary = applyImport(sec, plan);

    expect(summary).toEqual({ addedStudents: 1, scoresSet: 4 });
    expect(sec.students.map(s => s.name)).toEqual(['Ada', 'Bo', 'Cleo']);
    expect(sec.scores.stu_ada_a1).toEqual({ score: 10, excused: false });

    const cleo = sec.students.find(s => s.name === 'Cleo');
    expect(sec.scores[cleo.id + '_a2']).toEqual({ score: 70, excused: false });
  });

  it('a matrix export re-imports without changing grades', () => {
    const sec = section();
    const csv = buildMatrixCsv(sec);
    const before = buildReportCsv(sec);
    applyImport(sec, planImport(sec, csv));
    expect(buildReportCsv(sec)).toBe(before);
  });
});
