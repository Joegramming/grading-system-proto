import { describe, it, expect } from 'vitest';
import { computeStudentGrade, letterGrade } from './grading.js';

/**
 * Builds a section with one student ("s1"). Pass assignments as
 * { id, cat, max } and scores as { "<assignmentId>": number | {score, excused} }.
 */
function makeSection({ categories = [], assignments = [], scores = {} }) {
  const section = {
    id: 'sec1',
    name: 'Test',
    students: [{ id: 's1', name: 'Ada' }],
    categories,
    assignments: assignments.map(a => ({
      id: a.id, name: a.id, categoryId: a.cat, max: a.max
    })),
    scores: {}
  };
  for (const [assignId, v] of Object.entries(scores)) {
    const entry = typeof v === 'object' ? v : { score: v, excused: false };
    section.scores['s1_' + assignId] = entry;
  }
  return section;
}

describe('computeStudentGrade', () => {
  it('returns null final when nothing is graded', () => {
    const section = makeSection({
      categories: [{ id: 'c1', name: 'Quizzes', weight: 100 }],
      assignments: [{ id: 'a1', cat: 'c1', max: 10 }]
    });
    const { final, catBreakdown } = computeStudentGrade(section, 's1');
    expect(final).toBeNull();
    expect(catBreakdown).toEqual([{ name: 'Quizzes', weight: 100, pct: null }]);
  });

  it('single fully-graded category equals its raw percentage', () => {
    const section = makeSection({
      categories: [{ id: 'c1', name: 'Quizzes', weight: 100 }],
      assignments: [{ id: 'a1', cat: 'c1', max: 10 }],
      scores: { a1: 8 }
    });
    expect(computeStudentGrade(section, 's1').final).toBe(80);
  });

  it('sums earned and possible across multiple assignments in a category', () => {
    const section = makeSection({
      categories: [{ id: 'c1', name: 'Quizzes', weight: 100 }],
      assignments: [
        { id: 'a1', cat: 'c1', max: 10 },
        { id: 'a2', cat: 'c1', max: 30 }
      ],
      scores: { a1: 10, a2: 15 } // 25 / 40 = 62.5%
    });
    expect(computeStudentGrade(section, 's1').final).toBe(62.5);
  });

  it('weights two graded categories that sum to 100', () => {
    const section = makeSection({
      categories: [
        { id: 'c1', name: 'Quizzes', weight: 40 },
        { id: 'c2', name: 'Exams', weight: 60 }
      ],
      assignments: [
        { id: 'a1', cat: 'c1', max: 100 },
        { id: 'a2', cat: 'c2', max: 100 }
      ],
      scores: { a1: 90, a2: 70 } // 0.4*90 + 0.6*70 = 36 + 42 = 78
    });
    expect(computeStudentGrade(section, 's1').final).toBeCloseTo(78, 10);
  });

  it('re-normalises when categories do not sum to 100', () => {
    const section = makeSection({
      categories: [
        { id: 'c1', name: 'Quizzes', weight: 20 },
        { id: 'c2', name: 'Exams', weight: 20 }
      ],
      assignments: [
        { id: 'a1', cat: 'c1', max: 100 },
        { id: 'a2', cat: 'c2', max: 100 }
      ],
      scores: { a1: 100, a2: 50 } // both weight 20 -> plain average of 100 and 50
    });
    expect(computeStudentGrade(section, 's1').final).toBeCloseTo(75, 10);
  });

  it('re-normalises over only the graded categories in a half-finished term', () => {
    const section = makeSection({
      categories: [
        { id: 'c1', name: 'Quizzes', weight: 30 },
        { id: 'c2', name: 'Essays', weight: 30 },
        { id: 'c3', name: 'Exams', weight: 40 } // never graded -> dropped
      ],
      assignments: [
        { id: 'a1', cat: 'c1', max: 100 },
        { id: 'a2', cat: 'c2', max: 100 },
        { id: 'a3', cat: 'c3', max: 100 }
      ],
      scores: { a1: 90, a2: 60 } // (0.3*90 + 0.3*60) / 0.6 = 45 / 0.6 = 75
    });
    const { final, catBreakdown } = computeStudentGrade(section, 's1');
    expect(final).toBeCloseTo(75, 10);
    expect(catBreakdown.find(c => c.name === 'Exams').pct).toBeNull();
  });

  it('excludes excused assignments from earned and possible', () => {
    const section = makeSection({
      categories: [{ id: 'c1', name: 'Quizzes', weight: 100 }],
      assignments: [
        { id: 'a1', cat: 'c1', max: 10 },
        { id: 'a2', cat: 'c1', max: 10 }
      ],
      scores: {
        a1: 8,
        a2: { score: 2, excused: true } // ignored entirely -> 8/10
      }
    });
    expect(computeStudentGrade(section, 's1').final).toBe(80);
  });

  it('treats a blank (null) score as not graded', () => {
    const section = makeSection({
      categories: [{ id: 'c1', name: 'Quizzes', weight: 100 }],
      assignments: [
        { id: 'a1', cat: 'c1', max: 10 },
        { id: 'a2', cat: 'c1', max: 10 }
      ],
      scores: { a1: 5, a2: { score: null, excused: false } } // 5/10
    });
    expect(computeStudentGrade(section, 's1').final).toBe(50);
  });

  it('counts a genuine zero score', () => {
    const section = makeSection({
      categories: [{ id: 'c1', name: 'Quizzes', weight: 100 }],
      assignments: [
        { id: 'a1', cat: 'c1', max: 10 },
        { id: 'a2', cat: 'c1', max: 10 }
      ],
      scores: { a1: 10, a2: 0 } // 10/20 = 50%, not 100%
    });
    expect(computeStudentGrade(section, 's1').final).toBe(50);
  });

  it('ignores categories that have no assignments', () => {
    const section = makeSection({
      categories: [
        { id: 'c1', name: 'Quizzes', weight: 50 },
        { id: 'c2', name: 'Empty', weight: 50 }
      ],
      assignments: [{ id: 'a1', cat: 'c1', max: 100 }],
      scores: { a1: 88 }
    });
    expect(computeStudentGrade(section, 's1').final).toBe(88);
  });
});

describe('letterGrade', () => {
  it('maps null to a dash', () => {
    expect(letterGrade(null).letter).toBe('—');
  });

  it.each([
    [100, 'A'],
    [90, 'A'],
    [89.99, 'B'],
    [80, 'B'],
    [70, 'C'],
    [60, 'D'],
    [59.99, 'F'],
    [0, 'F']
  ])('maps %d%% to %s', (pct, letter) => {
    expect(letterGrade(pct).letter).toBe(letter);
  });
});
