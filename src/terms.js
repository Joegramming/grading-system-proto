/**
 * The Prelims / Midterms / Finals switch. There is one segmented control on
 * Setup and one on Grades; both read and write state.activeTerm.
 */
import { state, TERMS, TERM_LABELS, scheduleSave } from './state.js';
import { requestRender } from './bus.js';

export function initTerms() {
  document.querySelectorAll('[data-term-switch]').forEach(el => {
    el.addEventListener('click', e => {
      const btn = e.target.closest('[data-term]');
      if (!btn || btn.dataset.term === state.activeTerm) return;
      state.activeTerm = btn.dataset.term;
      scheduleSave();
      requestRender();
    });
  });
}

export function renderTermSwitches() {
  document.querySelectorAll('[data-term-switch]').forEach(el => {
    el.innerHTML = TERMS
      .map(t => `<button class="term-btn${t === state.activeTerm ? ' active' : ''}" data-term="${t}">${TERM_LABELS[t]}</button>`)
      .join('');
  });
}
