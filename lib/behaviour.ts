// Client behaviour. The DOM contract (class names, data attributes, storage key) is shared with components/site/.
// startBehaviour() returns a cleanup so React's effect (and StrictMode's double run in dev) never doubles listeners.
import { SENT_CONCEPT, SENT_LIVE, STARTED_FIELD } from './enquiry/fields.ts';

const SHORTLIST_KEY = 'appearances-shortlist';

function readShortlist(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SHORTLIST_KEY) || '[]') as string[]);
  } catch (error) {
    console.warn('Shortlist storage unavailable', error);
    return new Set();
  }
}

function initMenu(doc: Document, signal: AbortSignal) {
  const nav = doc.querySelector('.nav');
  const button = nav?.querySelector('.menu-btn');
  button?.addEventListener(
    'click',
    () => {
      const open = nav?.classList.toggle('open') ?? false;
      button.setAttribute('aria-expanded', String(open));
    },
    { signal },
  );
}

function initShortlist(doc: Document, signal: AbortSignal) {
  const list = readShortlist();
  const sync = () => {
    for (const btn of doc.querySelectorAll<HTMLElement>('.shortlist')) {
      btn.dataset.label ??= btn.textContent ?? '';
      const on = list.has(btn.dataset.slug ?? '');
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? '✓ Shortlisted' : btn.dataset.label;
    }
  };
  doc.addEventListener(
    'click',
    event => {
      const btn = (event.target as Element | null)?.closest<HTMLElement>('.shortlist');
      if (!btn) return;
      const slug = btn.dataset.slug ?? '';
      if (list.has(slug)) list.delete(slug);
      else list.add(slug);
      try {
        localStorage.setItem(SHORTLIST_KEY, JSON.stringify([...list]));
      } catch (error) {
        console.warn('Shortlist not saved', error);
      }
      sync();
    },
    { signal },
  );
  sync();
}

/**
 * Roster filter state from the query string. A role, era or format the page has no control for (a stale or mistyped
 * link) is ignored, rather than filtering every card out.
 */
export function rosterState(search: string, chips: { filter: string; value: string }[]): Record<string, string> {
  const params = new URLSearchParams(search);
  const known = (filter: string, value: string) => chips.some(chip => chip.filter === filter && chip.value === value);
  const pick = (filter: string) => {
    const value = params.get(filter) || '';
    return value && known(filter, value) ? value : '';
  };
  return { role: pick('role'), era: pick('era'), format: pick('format'), q: params.get('q') || '' };
}

/** The roster URL for a filter state: only set filters in the query, and the #fragment kept. */
export function rosterUrl(state: Record<string, string>, pathname: string, hash: string): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) if (value) next.set(key, value);
  return `${next.toString() ? `?${next}` : pathname}${hash}`;
}

/** The value to preselect in the enquiry form's "who you have in mind" list: the ?legend= slug if it is listed. */
export const legendChoice = (requested: string | null, options: string[]): string | null =>
  requested && options.includes(requested) ? requested : null;

function initRoster(doc: Document, signal: AbortSignal) {
  const roster = doc.querySelector<HTMLElement>('[data-roster]');
  if (!roster) return;
  // Role tabs are buttons (data-filter + data-value); era and format are <select data-filter> lists.
  const buttons = [...roster.querySelectorAll<HTMLElement>('button[data-filter]')];
  const selects = [...roster.querySelectorAll<HTMLSelectElement>('select[data-filter]')];
  const chipList = [
    ...buttons.map(chip => ({ filter: chip.dataset.filter ?? '', value: chip.dataset.value ?? '' })),
    ...selects.flatMap(select => [...select.options].map(option => ({ filter: select.dataset.filter ?? '', value: option.value }))),
  ];
  const state = rosterState(location.search, chipList);
  const cards = [...roster.querySelectorAll<HTMLElement>('.card')];
  const empty = roster.querySelector<HTMLElement>('.empty');
  const search = roster.querySelector<HTMLInputElement>('.roster-q');
  const count = roster.querySelector<HTMLElement>('[data-count]');
  if (!empty || !search) return;
  search.value = state.q;
  const apply = () => {
    let shown = 0;
    for (const card of cards) {
      const ok =
        (!state.role || card.dataset.role === state.role) &&
        (!state.era || card.dataset.era === state.era) &&
        (!state.format || (card.dataset.formats ?? '').split(' ').includes(state.format)) &&
        (!state.q || (card.dataset.search ?? '').includes(state.q.toLowerCase()));
      card.hidden = !ok;
      if (ok) shown += 1;
    }
    empty.hidden = shown > 0;
    if (count) count.textContent = (count.textContent ?? '').replace(/^Showing \d+/, `Showing ${shown}`);
    for (const chip of buttons) chip.setAttribute('aria-pressed', String(state[chip.dataset.filter ?? ''] === chip.dataset.value));
    for (const select of selects) select.value = state[select.dataset.filter ?? ''] ?? '';
    history.replaceState(history.state, '', rosterUrl(state, location.pathname, location.hash));
  };
  roster.addEventListener(
    'click',
    event => {
      const chip = (event.target as Element | null)?.closest<HTMLElement>('button[data-filter]');
      if (!chip) return;
      state[chip.dataset.filter ?? ''] = chip.dataset.value ?? '';
      apply();
    },
    { signal },
  );
  for (const select of selects)
    select.addEventListener(
      'change',
      () => {
        state[select.dataset.filter ?? ''] = select.value;
        apply();
      },
      { signal },
    );
  search.addEventListener(
    'input',
    () => {
      state.q = search.value.trim();
      apply();
    },
    { signal },
  );
  apply();
}

/** Builds the confirmation that replaces the form, with DOM calls (no HTML strings: Trusted Types blocks them). */
function confirmation(doc: Document, sent: boolean): HTMLElement {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const done = el('div', 'done');
  const official = el('span', 'official');
  const crest = el('span', 'crest md');
  crest.setAttribute('role', 'img');
  crest.setAttribute('aria-label', `${doc.body.dataset.orgName || 'Official'} crest`);
  official.append(crest, 'Enquiry received');
  done.append(official, el('h3', '', "Thanks, we're on it"), el('p', '', sent ? SENT_LIVE : SENT_CONCEPT));
  return done;
}

/** The message shown above the fields when the endpoint refuses an enquiry (JSON `error` from lib/enquiry/handler.ts). */
export function enquiryError(error: unknown): string {
  if (error === 'too-fast') return 'That was quick. Please check your details and send the enquiry again.';
  if (error === 'invalid') return "We couldn't send your enquiry. Check your name, work email and company, then send it again.";
  return "We couldn't send your enquiry just now. Please try again in a few minutes.";
}

function initEnquiry(doc: Document, signal: AbortSignal) {
  const params = new URLSearchParams(location.search);
  for (const form of doc.querySelectorAll<HTMLFormElement>('[data-enquiry]')) {
    // The script reports validity itself; without it, the browser's own validation runs before the form posts.
    form.noValidate = true;
    const started = form.querySelector<HTMLInputElement>(`[name=${STARTED_FIELD}]`);
    if (started) started.value = String(Date.now());
    const select = form.querySelector<HTMLSelectElement>('[name=legend]');
    // An unknown slug (hidden person, old link) would blank the select; keep the default option instead.
    const legend = select
      ? legendChoice(
          params.get('legend'),
          [...select.options].map(option => option.value),
        )
      : null;
    if (select && legend) select.value = legend;
    form.addEventListener(
      'submit',
      event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        // Concept build (no ENQUIRY_WEBHOOK_URL at build time): enquiries are not transmitted or stored anywhere.
        if (form.dataset.send === undefined) {
          form.replaceChildren(confirmation(doc, false));
          return;
        }
        const button = form.querySelector<HTMLButtonElement>('button[type=submit]');
        if (button) button.disabled = true;
        form.querySelector('.enquiry-alert')?.remove();
        const body = new URLSearchParams();
        for (const [key, value] of new FormData(form)) if (typeof value === 'string') body.append(key, value);
        fetch(form.action, { method: 'POST', body, headers: { Accept: 'application/json' } })
          .then(async response => {
            const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
            if (response.ok && result.ok) {
              form.replaceChildren(confirmation(doc, true));
              return;
            }
            throw new Error(result.error ?? `status ${response.status}`);
          })
          .catch((error: Error) => {
            console.warn('Enquiry not sent', error.message);
            const alert = doc.createElement('p');
            alert.className = 'enquiry-alert';
            alert.setAttribute('role', 'alert');
            alert.textContent = enquiryError(error.message);
            form.prepend(alert);
            if (button) button.disabled = false;
          });
      },
      { signal },
    );
  }
}

export function startBehaviour(doc: Document): () => void {
  const controller = new AbortController();
  initMenu(doc, controller.signal);
  initShortlist(doc, controller.signal);
  initRoster(doc, controller.signal);
  initEnquiry(doc, controller.signal);
  return () => controller.abort();
}
