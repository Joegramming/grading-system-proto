import { describe, it, expect, beforeEach } from 'vitest';
import { state, migrateToSemesters, reconcileState } from './state.js';

beforeEach(() => {
  state.semesters = [];
  state.subjects = [];
  state.activeSemesterId = null;
  state.activeSubjectId = null;
});

describe('migrateToSemesters', () => {
  it('folds subjects into one semester per (schoolYear, semester) pair; blanks -> Unsorted', () => {
    state.subjects = [
      { id: 'a', course: { code: 'X', schoolYear: 'SY 2025-2026', semester: 'First Semester' } },
      { id: 'b', course: { code: 'Y', schoolYear: 'SY 2025-2026', semester: 'First Semester' } },
      { id: 'c', course: { code: 'Z', schoolYear: 'SY 2025-2026', semester: 'Second Semester' } },
      { id: 'd', course: { code: 'W' } }
    ];

    migrateToSemesters();

    expect(state.semesters).toHaveLength(3);
    const byId = Object.fromEntries(state.semesters.map(s => [s.id, s]));

    expect(byId[state.subjects[0].semesterId].label).toBe('First Semester');
    expect(state.subjects[0].semesterId).toBe(state.subjects[1].semesterId);           // same pair -> same semester
    expect(state.subjects[2].semesterId).not.toBe(state.subjects[0].semesterId);       // different label
    expect(byId[state.subjects[3].semesterId]).toMatchObject({ schoolYear: 'Unsorted', label: 'Unsorted' });

    // the moved fields are stripped off the subject course
    expect(state.subjects[0].course.semester).toBeUndefined();
    expect(state.subjects[0].course.schoolYear).toBeUndefined();
  });

  it('leaves already-assigned subjects alone and is idempotent', () => {
    state.semesters = [{ id: 's1', schoolYear: 'SY 2025-2026', label: 'First Semester' }];
    state.subjects = [{ id: 'a', semesterId: 's1', course: { code: 'X' } }];

    migrateToSemesters();
    migrateToSemesters();

    expect(state.semesters).toHaveLength(1);
    expect(state.subjects[0].semesterId).toBe('s1');
  });
});

describe('reconcileState', () => {
  it('drops activeSubjectId when it is not in the active semester', () => {
    state.semesters = [{ id: 's1', schoolYear: 'Y', label: 'A' }, { id: 's2', schoolYear: 'Y', label: 'B' }];
    state.subjects = [
      { id: 'x', semesterId: 's1' },
      { id: 'y', semesterId: 's2' }
    ];
    state.activeSemesterId = 's1';
    state.activeSubjectId = 'y';   // belongs to s2, not the active semester

    reconcileState();

    expect(state.activeSubjectId).toBe('x');
  });

  it('handles the empty state', () => {
    reconcileState();
    expect(state.activeSemesterId).toBeNull();
    expect(state.activeSubjectId).toBeNull();
  });
});
