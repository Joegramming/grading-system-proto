import { renderSemesterSwitcher } from './semesters.js';
import {
  renderSubjectSwitcher, renderSubjectList, renderSubjectDetails
} from './subjects.js';
import { renderTermSwitches } from './terms.js';
import { renderStudents } from './students.js';
import { renderCategories } from './categories.js';
import { renderAssignments } from './assignments.js';
import { renderGradesMatrix } from './grades.js';
import { renderReports } from './reports.js';

/**
 * Redraws everything. Cheap at classroom scale, and it means no module has to
 * know which other views its change affects.
 */
export function renderAll() {
  renderSemesterSwitcher();
  renderSubjectSwitcher();
  renderSubjectList();
  renderSubjectDetails();
  renderTermSwitches();
  renderStudents();
  renderCategories();
  renderAssignments();
  renderGradesMatrix();
  renderReports();
}
