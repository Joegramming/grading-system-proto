import { describe, it, expect } from 'vitest';
import { parseCsv, planImport, applyImport } from './csv.js';

function subject() {
  return {
    id: 'sub1',
    course: { code: 'ITP 112', name: 'SA&D', semester: '', schoolYear: '', schedule: '', set: 'SET A' },
    students: [{ id: 'stu_ada', name: 'Ada' }, { id: 'stu_bo', name: 'Bo' }],
    terms: {
      prelims: {
        categories: [{ id: 'c1', name: 'Quizzes', weight: 100 }],
        assignments: [
          { id: 'a1', name: 'Quiz 1', categoryId: 'c1', max: 10 },
          { id: 'a2', name: 'Quiz 2', categoryId: 'c1', max: 10 }
        ]
      },
      midterms: { categories: [], assignments: [] },
      finals: { categories: [], assignments: [] }
    },
    scores: {
      stu_ada_a1: { score: 9, excused: false },
      stu_bo_a1: { score: null, excused: true }
    }
  };
}

describe('parseCsv', () => {
  it('handles quotes, commas, CRLF', () => {
    expect(parseCsv('"Doe, Jane","say ""hi"""')).toEqual([['Doe, Jane', 'say "hi"']]);
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

describe('planImport', () => {
  it('roster mode adds unknown names only', () => {
    const plan = planImport(subject(), 'prelims', 'Student\nAda\nCleo\n');
    expect(plan.mode).toBe('roster');
    expect(plan.newStudents).toEqual(['Cleo']);
  });

  it('matrix mode matches this term\'s assignments and reports skipped columns', () => {
    const csv = 'Student,Quiz 1,Homework 3,Quiz 2\nAda,10,5,8\nCleo,7,,EXC\n';
    const plan = planImport(subject(), 'prelims', csv);
    expect(plan.matchedColumns).toBe(2);
    expect(plan.skippedColumns).toEqual(['Homework 3']);
    expect(plan.newStudents).toEqual(['Cleo']);
    expect(plan.scoreUpdates).toEqual([
      { name: 'Ada', assignmentId: 'a1', score: 10, excused: false },
      { name: 'Ada', assignmentId: 'a2', score: 8, excused: false },
      { name: 'Cleo', assignmentId: 'a1', score: 7, excused: false },
      { name: 'Cleo', assignmentId: 'a2', score: null, excused: true }
    ]);
  });

  it('does not match a column that belongs to another term', () => {
    const sub = subject();
    sub.terms.midterms.assignments = [{ id: 'm1', name: 'Midterm Exam', categoryId: 'x', max: 100 }];
    const plan = planImport(sub, 'prelims', 'Student,Midterm Exam\nAda,88\n');
    expect(plan.matchedColumns).toBe(0);
    expect(plan.skippedColumns).toEqual(['Midterm Exam']);
  });
});

describe('applyImport', () => {
  it('adds students and writes scores into subject.scores', () => {
    const sub = subject();
    const plan = planImport(sub, 'prelims', 'Student,Quiz 1,Quiz 2\nAda,10,10\nCleo,6,7\n');
    const summary = applyImport(sub, plan);
    expect(summary).toEqual({ addedStudents: 1, scoresSet: 4 });
    expect(sub.students.map(s => s.name)).toEqual(['Ada', 'Bo', 'Cleo']);
    expect(sub.scores.stu_ada_a1).toEqual({ score: 10, excused: false });
    const cleo = sub.students.find(s => s.name === 'Cleo');
    expect(sub.scores[cleo.id + '_a2']).toEqual({ score: 7, excused: false });
  });
});
