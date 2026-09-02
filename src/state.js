import { api } from './api/index.js';
import { uid, showToast } from './utils.js';

/**
 * The whole app's data.
 *
 * subjects: [{
 *   id,
 *   course: { code, name, semester, schoolYear, schedule, set },   plain strings
 *   students: [{ id, name }],
 *   terms: {
 *     prelims:  { categories: [{ id, name, weight }], assignments: [{ id, name, categoryId, max }] },
 *     midterms: { ...same shape... },
 *     finals:   { ...same shape... }
 *   },
 *   scores: { "<studentId>_<assignmentId>": { score, excused } }   // assignment ids are unique across terms
 * }]
 *
 * Exported as a const and always mutated in place — reassigning it would
 * leave every importing module pointing at the old object.
 */
export const TERMS = ['prelims', 'midterms', 'finals'];
export const TERM_LABELS = { prelims: 'Prelims', midterms: 'Midterms', finals: 'Finals' };

export const state = {
  activeSubjectId: null,
  activeTerm: 'prelims',
  subjects: []
};

function emptyTerm() {
  return { categories: [], assignments: [] };
}

export function createSubject(course = {}) {
  return {
    id: uid(),
    course: {
      code: course.code || '',
      name: course.name || '',
      semester: course.semester || '',
      schoolYear: course.schoolYear || '',
      schedule: course.schedule || '',
      set: course.set || '',
      courseYear: course.courseYear || '',       // e.g. "BIST II-B" (grade sheet)
      instructor: course.instructor || '',       // "Prepared by" on the grade sheet
      programChair: course.programChair || ''     // "Verified by" on the grade sheet
    },
    students: [],
    terms: { prelims: emptyTerm(), midterms: emptyTerm(), finals: emptyTerm() },
    scores: {}
  };
}

export function getActiveSubject() {
  return state.subjects.find(s => s.id === state.activeSubjectId) || null;
}

/** The { categories, assignments } object for the subject + term in focus. */
export function getActiveTermData() {
  const subject = getActiveSubject();
  return subject ? subject.terms[state.activeTerm] : null;
}

/** Short label for switchers and lists, e.g. "ITP 112 · SET A". */
export function subjectLabel(subject) {
  if (!subject) return '—';
  const c = subject.course;
  const head = c.code || c.name || 'Untitled subject';
  return c.set ? `${head} · ${c.set}` : head;
}

/**
 * Point activeSubjectId / activeTerm at something valid. Zero subjects is a
 * fine state — the UI shows an empty prompt rather than an "Untitled subject".
 */
export function reconcileState() {
  if (!getActiveSubject()) {
    state.activeSubjectId = state.subjects[0] ? state.subjects[0].id : null;
  }
  if (!TERMS.includes(state.activeTerm)) state.activeTerm = 'prelims';
}

/* ---------- PERSISTENCE ---------- */

let saveTimer = null;
let pendingToast = null;

/**
 * Coalesces bursts of edits (typing in the score matrix) into one write.
 * Pass a short message to confirm the specific action once the save lands;
 * omit it for silent saves (e.g. switching subject or term).
 */
export function scheduleSave(message = null) {
  pendingToast = message;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 400);
}

export async function saveState() {
  const message = pendingToast;
  pendingToast = null;
  try {
    await api.save(state);
    if (message) showToast(message);
  } catch (e) {
    console.error('Save failed', e);
    showToast('Save failed — check the console', 'error');
  }
}

export async function loadState() {
  try {
    const data = await api.load();
    if (data && Array.isArray(data.subjects)) {
      state.subjects = data.subjects;
      state.activeSubjectId = data.activeSubjectId;
      if (typeof data.activeTerm === 'string') state.activeTerm = data.activeTerm;
    }
  } catch (e) {
    console.error('Load failed — starting with an empty gradebook', e);
  }
  reconcileState();
}
