/* Foot bar proposal: a small state machine, no framework.
   state: unwatched | watched (just marked, Undo available) | unrated | rated | taken
   Rating and watched status save immediately; the review editor saves on Save. */

const REVIEW_MAX = 500;
const SAMPLE_REVIEW = "Three hours and I'd have sat through another one. The sound design does half the acting.";
const SAMPLE_NOTE = 'Saw it in 70mm with Jess. Worth the trip across town.';
const TODAY = '2026-10-04';

/* Every string in the bar, in one place so it moves into @plot/core/copy as-is. */
const COPY = {
  unwatchedHead: 'Watched it?',
  unwatchedHint: 'Tap a star to rate it',
  markWatched: "I've watched",
  imWatching: "I'm watching",
  takeHead: 'Thoughts?',
  watchedOn: (date) => `Watched on ${date}`,
  watchedJustNow: 'Watched',
  undo: 'Undo',
  reviewLabel: 'Review',
  reviewEmpty: 'What did you think?',
  reviewAudience: { public: 'Visible on your profile', private: 'Visible to your followers' },
  noteLabel: 'Private note',
  noteEmpty: 'Add a thought for later',
  noteAudience: 'Only visible to you',
  editorTitle: 'Review and notes',
  ratingLabel: 'Rating',
  ratingSaved: 'Saved',
  reviewPlaceholder: 'What did you think?',
  dateLabel: 'Watched on',
  delete: 'Delete',
  cancel: 'Cancel',
  save: 'Save',
  watchedAndRated: (stars) => `Watched and rated ${stars} ${stars === 1 ? 'star' : 'stars'}`,
  watchedRemoved: 'Watched removed',
  saved: 'Saved',
  deleted: 'Deleted',
};

const ui = {
  profile: 'public',
  state: 'unwatched',
  kind: 'film',
  device: 'desktop',
  rating: 0,
  review: '',
  note: '',
  date: TODAY,
  editing: false,
  draft: null,
};
let undoTimer = null;
let toastTimer = null;

const $ = (id) => document.getElementById(id);
const foot = $('foot');
const panel = $('panel');

const fmtDate = (iso) => {
  if (iso === TODAY) return 'today';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
};

const TICK = '<svg class="tick" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
const LOCK = '<svg class="fb-lock" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="Has a private note"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9"/></svg>';

const fillPct = (rating, n) => Math.max(0, Math.min(1, rating - (n - 1))) * 100;

function starsHtml(value, { ghost = false, label = 'Rating' } = {}) {
  const stars = [1, 2, 3, 4, 5].map((n) => `
    <button type="button" class="fb-star" data-star="${n}" aria-label="Rate ${n - 0.5} or ${n} stars">
      <span class="base">${STAR}</span>
      <span class="fill" style="width:${(fillPct(value, n) / 100) * 26}px">${STAR}</span>
    </button>`).join('');
  return `<div class="fb-stars${ghost ? ' is-ghost' : ''}" data-value="${value}" role="group" aria-label="${label}">${stars}</div>`;
}

const STAR_SM = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9"/></svg>';
const LOCK_SM = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
const PLUS = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const PENCIL = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

/* Layout, every state, one grid:
     head   what this bar is asking, and the watch status chip on the right
     main   stars on the left, the one next action on the right
     quote  the written review, only once there is one
   The editor replaces main and quote; the head stays put. */
function headHtml() {
  const { state, editing } = ui;
  if (editing) return '<div class="fb-head"><b class="fb-title">' + COPY.editorTitle + '</b><span class="fb-saved" id="ed-saved">' + (ui.rating ? COPY.ratingSaved : '') + '</span></div>';
  if (state === 'unwatched') {
    return '<div class="fb-head"><b class="fb-title">' + COPY.unwatchedHead + '</b><span class="fb-hint">' + COPY.unwatchedHint + '</span></div>';
  }
  const when = state === 'watched' ? COPY.watchedJustNow : COPY.watchedOn(fmtDate(ui.date));
  const chip = '<button type="button" class="fb-chip" data-act="date" aria-label="' + when + ', change date">' + TICK + '<span>' + when + '</span>' + PENCIL + '</button>';
  const undo = state === 'watched' ? '<button type="button" class="btn btn--ghost btn--sm" data-act="undo">' + COPY.undo + '</button>' : '';
  return '<div class="fb-head"><b class="fb-title">' + COPY.takeHead + '</b><span class="fb-head-end">' + undo + chip + '</span></div>';
}

function mainHtml() {
  const { state, rating, kind } = ui;
  if (state === 'unwatched') {
    return '<div class="fb-main">' + starsHtml(0, { ghost: true, label: 'Rate and log as watched' }) +
      '<span class="fb-actions">' +
      (kind === 'series' ? '<button type="button" class="btn btn--ghost" data-act="watching">' + COPY.imWatching + '</button>' : '') +
      '<button type="button" class="btn btn--primary" data-act="mark">' + COPY.markWatched + '</button></span></div>';
  }
  const score = rating ? '<span class="fb-score">' + rating + '</span>' : '';
  return '<div class="fb-main"><span class="fb-rate">' + starsHtml(rating) + score + '</span></div>';
}

function quoteHtml() {
  if (ui.state === 'unwatched') return '';
  const box = (kind, label, icon, text, empty) =>
    '<button type="button" class="fb-quote' + (kind === 'private' ? ' fb-quote--private' : '') + (text ? '' : ' fb-quote--empty') + '" data-act="edit" aria-label="' + (text ? 'Edit your ' : 'Add your ') + label.toLowerCase() + '">' +
    '<span class="fb-edit" aria-hidden="true">' + (text ? PENCIL : PLUS) + '</span>' +
    '<span class="fb-quote-label">' + icon + label + '</span>' +
    '<span class="fb-quote-text">' + (text ? esc(text) : empty) + '</span></button>';
  return '<div class="fb-quotes">' +
    box('review', COPY.reviewLabel, STAR_SM, ui.review, COPY.reviewEmpty) +
    box('private', COPY.noteLabel, LOCK_SM, ui.note, COPY.noteEmpty) + '</div>';
}

function editorHtml() {
  const d = ui.draft;
  const left = REVIEW_MAX - d.review.length;
  return '<div class="ed" role="group" aria-label="' + COPY.editorTitle + '">' +
    '<div class="ed-rating"><span class="ed-label">' + COPY.ratingLabel + '</span><span class="fb-rate">' + starsHtml(ui.rating) + (ui.rating ? '<span class="fb-score">' + ui.rating + '</span>' : '') + '</span></div>' +
    '<section class="ed-field ed-field--review"><label for="ed-review"><span class="ed-tag">' + STAR_SM + COPY.reviewLabel + '</span><span class="ed-aud">' + COPY.reviewAudience[ui.profile] + '</span></label>' +
    '<textarea id="ed-review" maxlength="' + REVIEW_MAX + '" placeholder="' + COPY.reviewPlaceholder + '">' + esc(d.review) + '</textarea>' +
    '<div class="ed-count' + (left < 50 ? ' is-near' : '') + '" id="ed-count">' + left + '</div></section>' +
    '<section class="ed-field ed-field--private"><label for="ed-note"><span class="ed-tag">' + LOCK_SM + COPY.noteLabel + '</span><span class="ed-aud">' + COPY.noteAudience + '</span></label>' +
    '<textarea id="ed-note" placeholder="' + COPY.noteEmpty + '">' + esc(d.note) + '</textarea></section>' +
    '<div class="ed-actions">' +
    '<div class="ed-date"><label for="ed-date">' + COPY.dateLabel + '</label><input id="ed-date" type="date" value="' + d.date + '" max="' + TODAY + '"></div>' +
    '<span class="fb-actions">' +
    (ui.review || ui.note ? '<button type="button" class="btn btn--ghost" data-act="remove">' + COPY.delete + '</button>' : '') +
    '<button type="button" class="btn btn--ghost" data-act="cancel">' + COPY.cancel + '</button>' +
    '<button type="button" class="btn btn--primary" data-act="save">' + COPY.save + '</button></span></div></div>';
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function render() {
  foot.className = `foot fb${ui.editing ? ' is-open' : ''}`;
  foot.innerHTML = '<div class="ed-handle" aria-hidden="true"></div>' + headHtml() +
    (ui.editing ? editorHtml() : mainHtml() + quoteHtml()) +
    (ui.state === 'watched' && !ui.editing ? '<span class="fb-undo-bar" aria-hidden="true"></span>' : '');
  $('scrim').hidden = !(ui.editing && ui.device === 'phone');
  panel.classList.toggle('is-phone', ui.device === 'phone');

  const pill = $('status-pill');
  const watched = ui.state !== 'unwatched';
  pill.className = `pill pill--status${watched ? ' is-on' : ''}`;
  pill.innerHTML = watched
    ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Watched'
    : COPY.markWatched;
  $('kind-label').textContent = ui.kind === 'series' ? 'Series' : 'Film';

  document.querySelectorAll('[data-seg]').forEach((seg) => {
    const key = seg.dataset.seg;
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(ui[key] === b.dataset.v)));
  });
  if (ui.editing) $(focusId)?.focus({ preventScroll: true });
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

/* A just-marked title settles back to the normal bar after six seconds, which is
   also how long Undo stays offered. */
function startUndoWindow() {
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    if (ui.state === 'watched' && !ui.editing) { ui.state = ui.rating ? 'rated' : 'unrated'; render(); }
  }, 6000);
}

function markWatched(rating = 0) {
  ui.rating = rating;
  ui.date = TODAY;
  if (rating) {
    ui.state = 'rated';
    toast(COPY.watchedAndRated(rating));
  } else {
    ui.state = 'watched';
    startUndoWindow();
  }
  render();
}

function setRating(value) {
  ui.rating = value;
  if (ui.state === 'watched' || ui.state === 'unrated') ui.state = 'rated';
  if (ui.state === 'rated' && ui.review) ui.state = 'taken';
  clearTimeout(undoTimer);
  if (ui.editing) {
    render();
    $('ed-saved').textContent = COPY.ratingSaved;
  } else {
    render();
  }
}

let focusId = 'ed-review';
function openEditor() {
  clearTimeout(undoTimer);
  if (ui.state === 'watched') ui.state = ui.rating ? 'rated' : 'unrated';
  ui.draft = ui.draft || { review: ui.review, note: ui.note, date: ui.date };
  ui.editing = true;
  render();
}

function closeEditor({ keepDraft = true } = {}) {
  if (ui.editing && keepDraft) {
    ui.draft = {
      review: $('ed-review')?.value ?? ui.draft.review,
      note: $('ed-note')?.value ?? ui.draft.note,
      date: $('ed-date')?.value || ui.draft.date,
    };
  } else if (!keepDraft) {
    ui.draft = null;
  }
  ui.editing = false;
  render();
}

function save() {
  ui.review = $('ed-review').value.trim();
  ui.note = $('ed-note').value.trim();
  ui.date = $('ed-date').value || ui.date;
  ui.draft = null;
  ui.editing = false;
  ui.state = ui.review ? 'taken' : ui.rating ? 'rated' : 'unrated';
  render();
  toast(COPY.saved);
}

function reset(state) {
  clearTimeout(undoTimer);
  ui.editing = false;
  ui.draft = null;
  ui.state = state;
  ui.date = state === 'watched' ? TODAY : '2023-07-21';
  ui.rating = { unwatched: 0, watched: 0, unrated: 0, rated: 4, taken: 4.5 }[state];
  ui.review = state === 'taken' ? SAMPLE_REVIEW : '';
  ui.note = state === 'taken' ? SAMPLE_NOTE : '';
  if (state === 'watched') startUndoWindow();
  render();
}

/* Half stars: the left half of a star is n - 0.5, the right half is n. Tapping the
   score you already have clears it. */
function starValue(event, n) {
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientX - box.left < box.width / 2 ? n - 0.5 : n;
}

foot.addEventListener('click', (event) => {
  const star = event.target.closest('[data-star]');
  if (star) {
    const value = starValue(event, Number(star.dataset.star));
    if (ui.state === 'unwatched') { markWatched(value); return; }
    setRating(value === ui.rating ? 0 : value);
    return;
  }
  const act = event.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  if (act === 'mark') markWatched();
  else if (act === 'watching') toast(COPY.imWatching);
  else if (act === 'undo') { clearTimeout(undoTimer); ui.state = 'unwatched'; ui.rating = 0; render(); toast(COPY.watchedRemoved); }
  else if (act === 'date' || act === 'edit') {
    focusId = event.target.closest('.fb-quote--private') ? 'ed-note' : act === 'date' ? 'ed-date' : 'ed-review';
    openEditor();
  }
  else if (act === 'cancel') closeEditor({ keepDraft: false });
  else if (act === 'save') save();
  else if (act === 'remove') {
    ui.review = ''; ui.note = ''; ui.draft = null; ui.editing = false;
    ui.state = ui.rating ? 'rated' : 'unrated';
    render(); toast(COPY.deleted);
  }
});

foot.addEventListener('input', (event) => {
  if (event.target.id === 'ed-review') {
    const left = REVIEW_MAX - event.target.value.length;
    const count = $('ed-count');
    count.textContent = left;
    count.classList.toggle('is-near', left < 50);
  }
});

/* Hover previews the half star under the pointer. */
foot.addEventListener('pointermove', (event) => {
  const star = event.target.closest('[data-star]');
  const group = star?.parentElement;
  if (!group || event.pointerType === 'touch') return;
  const value = starValue({ clientX: event.clientX, currentTarget: star }, Number(star.dataset.star));
  group.querySelectorAll('[data-star]').forEach((s) => {
    const n = Number(s.dataset.star);
    s.querySelector('.fill').style.width = `${(fillPct(value, n) / 100) * 26}px`;
  });
});
/* Restore the saved fill without re-rendering, so a half-typed review survives. */
foot.addEventListener('pointerout', (event) => {
  const group = event.target.closest?.('.fb-stars');
  if (!group || group.contains(event.relatedTarget)) return;
  const saved = Number(group.dataset.value);
  group.querySelectorAll('[data-star]').forEach((s) => {
    s.querySelector('.fill').style.width = `${(fillPct(saved, Number(s.dataset.star)) / 100) * 26}px`;
  });
});

$('scrim').addEventListener('click', () => closeEditor());
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && ui.editing) closeEditor(); });
$('status-pill').addEventListener('click', () => {
  if (ui.state === 'unwatched') markWatched();
  else { ui.state = 'unwatched'; ui.rating = 0; render(); toast(COPY.watchedRemoved); }
});

document.querySelectorAll('[data-seg]').forEach((seg) => {
  seg.addEventListener('click', (event) => {
    const v = event.target.closest('button')?.dataset.v;
    if (!v) return;
    const key = seg.dataset.seg;
    if (key === 'state') reset(v);
    else { ui[key] = v; render(); }
  });
});

document.querySelectorAll('.panel button:not(.fb-star):not(.btn):not(.fb-quote):not(.fb-chip):not(#status-pill)').forEach((b) => {
  b.addEventListener('click', (e) => e.preventDefault());
});

reset('unwatched');
