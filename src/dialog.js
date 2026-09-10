/**
 * In-app modal dialogs — a styled, keyboard-friendly stand-in for the browser's
 * window.confirm / alert / prompt.
 *
 *   confirmAction({...}) -> Promise<boolean>   (true = confirmed)
 *   promptText({...})    -> Promise<string|null>  (null = cancelled or blank)
 *   formDialog({...})    -> Promise<Record<string,string>|null>  (a few fields)
 *
 * Message text is always escaped; callers pass plain strings, never markup.
 */
import { escapeHtml } from './utils.js';

const FOCUSABLE = 'button, input, [tabindex]:not([tabindex="-1"])';

function mount(innerHtml) {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML = innerHtml;
  document.body.appendChild(overlay);
  return overlay;
}

function trapTab(e, overlay) {
  const f = [...overlay.querySelectorAll(FOCUSABLE)];
  if (!f.length) return;
  const first = f[0];
  const last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function bodyHtml({ message, messageLines }) {
  if (messageLines && messageLines.length) {
    return messageLines.map(l => `<div class="dialog-line">${escapeHtml(l)}</div>`).join('');
  }
  return `<p>${escapeHtml(message || '')}</p>`;
}

/**
 * Yes/no (or just OK). Pass cancelLabel: null for a single-button notice.
 * tone: 'danger' colours the confirm button red.
 */
export function confirmAction(opts) {
  const {
    title,
    confirmLabel = 'OK',
    cancelLabel = 'Cancel',
    tone = 'default'
  } = opts;

  return new Promise(resolve => {
    const prevFocus = document.activeElement;
    const cancelBtn = cancelLabel
      ? `<button class="btn-ghost" data-dlg="cancel">${escapeHtml(cancelLabel)}</button>`
      : '';
    const overlay = mount(`
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
        <h2 id="dlg-title">${escapeHtml(title)}</h2>
        <div class="dialog-body">${bodyHtml(opts)}</div>
        <div class="dialog-actions">
          ${cancelBtn}
          <button class="btn${tone === 'danger' ? ' btn-danger' : ''}" data-dlg="ok">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`);

    const done = value => {
      overlay.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(value);
    };

    overlay.querySelector('[data-dlg="ok"]').addEventListener('click', () => done(true));
    const cancelEl = overlay.querySelector('[data-dlg="cancel"]');
    if (cancelEl) cancelEl.addEventListener('click', () => done(false));
    overlay.addEventListener('mousedown', e => { if (e.target === overlay && cancelLabel) done(false); });
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape' && cancelLabel) { e.preventDefault(); done(false); }
      else if (e.key === 'Enter') { e.preventDefault(); done(true); }
      else if (e.key === 'Tab') trapTab(e, overlay);
    });

    // Destructive dialogs focus the safe choice; others focus the confirm.
    const startEl = (tone === 'danger' && cancelEl) ? cancelEl : overlay.querySelector('[data-dlg="ok"]');
    startEl.focus();
  });
}

/** One line of text input. Resolves the trimmed value, or null if blank/cancelled. */
export function promptText(opts) {
  const {
    title,
    message = '',
    placeholder = '',
    value = '',
    confirmLabel = 'OK',
    cancelLabel = 'Cancel'
  } = opts;

  return new Promise(resolve => {
    const prevFocus = document.activeElement;
    const overlay = mount(`
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
        <h2 id="dlg-title">${escapeHtml(title)}</h2>
        ${message ? `<div class="dialog-body"><p>${escapeHtml(message)}</p></div>` : ''}
        <input class="dialog-input" type="text" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value)}">
        <div class="dialog-actions">
          <button class="btn-ghost" data-dlg="cancel">${escapeHtml(cancelLabel)}</button>
          <button class="btn" data-dlg="ok">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`);

    const input = overlay.querySelector('.dialog-input');
    const done = ok => {
      const text = ok ? input.value.trim() : '';
      overlay.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(text || null);
    };

    overlay.querySelector('[data-dlg="ok"]').addEventListener('click', () => done(true));
    overlay.querySelector('[data-dlg="cancel"]').addEventListener('click', () => done(false));
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) done(false); });
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      else if (e.key === 'Enter') { e.preventDefault(); done(true); }
      else if (e.key === 'Tab') trapTab(e, overlay);
    });

    input.focus();
    input.select();
  });
}

/**
 * A few fields at once. `fields`: array of
 *   { key, label, type?: 'text' | 'select', placeholder?, value?, options?: [{value,label}] }
 * Resolves an object of trimmed values keyed by `key`, or null if cancelled.
 */
export function formDialog({ title, message = '', fields = [], confirmLabel = 'OK', cancelLabel = 'Cancel' }) {
  return new Promise(resolve => {
    const prevFocus = document.activeElement;

    const rows = fields.map(f => {
      if (f.type === 'select') {
        const opts = (f.options || []).map(o =>
          `<option value="${escapeHtml(o.value)}" ${o.value === (f.value || '') ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
        ).join('');
        return `<label class="dialog-field"><span>${escapeHtml(f.label)}</span>
          <select class="dialog-input" data-key="${escapeHtml(f.key)}">${opts}</select></label>`;
      }
      return `<label class="dialog-field"><span>${escapeHtml(f.label)}</span>
        <input class="dialog-input" type="text" data-key="${escapeHtml(f.key)}"
          placeholder="${escapeHtml(f.placeholder || '')}" value="${escapeHtml(f.value || '')}"></label>`;
    }).join('');

    const overlay = mount(`
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
        <h2 id="dlg-title">${escapeHtml(title)}</h2>
        ${message ? `<div class="dialog-body"><p>${escapeHtml(message)}</p></div>` : ''}
        <div class="dialog-form">${rows}</div>
        <div class="dialog-actions">
          <button class="btn-ghost" data-dlg="cancel">${escapeHtml(cancelLabel)}</button>
          <button class="btn" data-dlg="ok">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`);

    const done = ok => {
      let result = null;
      if (ok) {
        result = {};
        overlay.querySelectorAll('[data-key]').forEach(el => { result[el.dataset.key] = el.value.trim(); });
      }
      overlay.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(result);
    };

    overlay.querySelector('[data-dlg="ok"]').addEventListener('click', () => done(true));
    overlay.querySelector('[data-dlg="cancel"]').addEventListener('click', () => done(false));
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) done(false); });
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      else if (e.key === 'Enter' && e.target.tagName !== 'SELECT') { e.preventDefault(); done(true); }
      else if (e.key === 'Tab') trapTab(e, overlay);
    });

    const first = overlay.querySelector('.dialog-input');
    if (first) { first.focus(); if (first.select) first.select(); }
  });
}
