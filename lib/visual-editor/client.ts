// The CMS's visual editor on the live pages, like the Credible Creators CMS: an "Edit page" bar for signed-in
// editors; in edit mode every element marked with data-edit (components/site/primitives.tsx → edit()) is outlined,
// clicking one opens a panel with its fields, single-text elements update as you type, and Save sends the changes
// to /admin/api/visual, which validates and saves them like the page editors (lib/cms/web.ts).
//
// Loaded only when the CMS's marker cookie is present (components/behaviour.tsx). Builds every node with DOM calls
// (Trusted Types forbid HTML strings) and styles with classes from /admin/assets/visual-editor.css (no inline styles).
import { decode } from '../render/text.ts';

interface FieldInfo {
  label: string;
  kind: string;
  hint?: string;
  placeholder?: string;
  options?: [string, string][];
  page: string;
  value: string | boolean;
}

interface Catalog {
  canEdit: boolean;
  csrf: string;
  page: string | null;
  tokens: Record<string, string | undefined>;
  filled: string[];
  images: string[];
  fields: Record<string, FieldInfo>;
}

interface SaveResult {
  ok: boolean;
  message?: string;
  problems?: string[];
}

const API = '/admin/api/visual';
const ATTR = 'data-edit';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string; attrs?: Record<string, string> } = {},
  children: (Node | null)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  for (const [key, value] of Object.entries(props.attrs ?? {})) node.setAttribute(key, value);
  for (const child of children) if (child) node.append(child);
  return node;
}

/** Stored content is "HTML text" (`&amp;` for &): the editor shows plain text and stores the canonical form. */
const encode = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const pathsOf = (node: Element) => (node.getAttribute(ATTR) ?? '').split(' ').filter(Boolean);

/** Once per page load (React's development double effects would otherwise start two editors). */
let started = false;

/**
 * `autoEdit` (the page was opened with ?edit=1, from the CMS's "Edit on the page" buttons) starts in edit mode, and
 * when the visitor isn't signed in shows a sign-in link instead of nothing.
 */
export async function startVisualEditor(doc: Document, { autoEdit = false }: { autoEdit?: boolean } = {}): Promise<void> {
  if (started) return;
  started = true;
  if (autoEdit) {
    const clean = new URL(location.href);
    clean.searchParams.delete('edit');
    history.replaceState(history.state, '', clean.pathname + clean.search + clean.hash);
  }
  const stylesheet = el('link', { attrs: { rel: 'stylesheet', href: '/admin/assets/visual-editor.css' } });
  const response = await fetch(`${API}?path=${encodeURIComponent(location.pathname)}`, { credentials: 'same-origin' }).catch(() => null);
  const catalog = response?.ok ? ((await response.json()) as Catalog) : null;
  if (!catalog?.canEdit) {
    if (!autoEdit) return;
    doc.head.append(stylesheet);
    const text = catalog ? 'Your CMS role can view but not edit.' : 'Sign in to the CMS to edit this page.';
    const link = el('a', { className: 'pt-ve-btn primary', text: catalog ? 'Open the CMS' : 'Sign in', attrs: { href: '/admin' } });
    doc.body.append(
      el('div', { className: 'pt-ve-bar', attrs: { role: 'region', 'aria-label': 'Page editor' } }, [
        el('p', { className: 'pt-ve-msg', text }),
        link,
      ]),
    );
    return;
  }
  doc.head.append(stylesheet);

  /** Unsaved values by path. Text fields hold plain text; check fields booleans. */
  const pending = new Map<string, string | boolean>();
  /** Original text of elements changed in place, to restore on Discard. */
  const originals = new Map<Element, string>();
  let editing = false;
  let selected: Element | null = null;

  const shown = (path: string, value: string | boolean): string => {
    const info = catalog.fields[path];
    let text = typeof value === 'string' ? value : '';
    if (!text && info?.placeholder) text = decode(info.placeholder);
    if (catalog.filled.includes(path))
      text = text.replace(/\{(\w+)\}/g, (match, name: string) => decode(catalog.tokens[name] ?? '') || match);
    return text;
  };
  /** The saved value as the editor shows it: wording still on the standard text starts from that text. */
  const baseline = (path: string): string | boolean => {
    const info = catalog.fields[path];
    const value = info?.value ?? '';
    if (typeof value !== 'string') return value;
    return value === '' && info?.placeholder ? decode(info.placeholder) : decode(value);
  };
  const current = (path: string): string | boolean => (pending.has(path) ? (pending.get(path) as string | boolean) : baseline(path));

  // ---- The bar ----
  const toggle = el('button', { className: 'pt-ve-btn primary', text: 'Edit page', attrs: { type: 'button' } });
  const save = el('button', { className: 'pt-ve-btn primary', text: 'Save', attrs: { type: 'button' } });
  const discard = el('button', { className: 'pt-ve-btn', text: 'Discard', attrs: { type: 'button' } });
  const full = el('a', {
    className: 'pt-ve-link',
    text: 'Full editor',
    attrs: { href: catalog.page ? `/admin/pages/${catalog.page}` : '/admin/pages' },
  });
  const cms = el('a', { className: 'pt-ve-link', text: 'CMS', attrs: { href: '/admin' } });
  const message = el('p', { className: 'pt-ve-msg', attrs: { role: 'status', 'aria-live': 'polite' } });
  const tools = el('span', { className: 'pt-ve-tools' }, [save, discard, full]);
  const bar = el('div', { className: 'pt-ve-bar', attrs: { role: 'region', 'aria-label': 'Page editor' } }, [toggle, tools, cms, message]);
  doc.body.append(bar);

  const panel = el('div', { className: 'pt-ve-panel', attrs: { role: 'dialog', 'aria-label': 'Edit content' } });
  panel.hidden = true;
  doc.body.append(panel);

  const imageList = el(
    'datalist',
    { attrs: { id: 'pt-ve-images' } },
    catalog.images.map(id => el('option', { attrs: { value: id } })),
  );
  doc.body.append(imageList);

  const say = (text: string, kind: 'ok' | 'error' | '' = '') => {
    message.textContent = text;
    message.className = `pt-ve-msg${kind ? ` ${kind}` : ''}`;
  };
  const refresh = () => {
    toggle.textContent = editing ? 'Done editing' : 'Edit page';
    toggle.className = `pt-ve-btn${editing ? '' : ' primary'}`;
    tools.hidden = !editing;
    save.disabled = pending.size === 0;
    discard.disabled = pending.size === 0;
    doc.body.classList.toggle('pt-editing', editing);
  };

  // ---- Live preview ----
  /** Elements showing exactly one field's text are edited in place; anything else only through the panel. */
  const liveTargets = (path: string) =>
    [...doc.querySelectorAll(`[${ATTR}]`)].filter(node => {
      const list = pathsOf(node);
      if (list.length !== 1 || list[0] !== path || node.childElementCount > 0) return false;
      if (originals.has(node)) return true;
      return (node.textContent ?? '').trim() === shown(path, current(path)).trim();
    });
  const setValue = (path: string, value: string | boolean) => {
    const targets = liveTargets(path);
    const unchanged = value === baseline(path);
    if (unchanged) pending.delete(path);
    else pending.set(path, value);
    for (const node of targets) {
      if (!originals.has(node)) originals.set(node, node.textContent ?? '');
      node.textContent = shown(path, value);
      node.classList.toggle('pt-changed', !unchanged);
    }
    for (const node of doc.querySelectorAll(`[${ATTR}]`))
      if (pathsOf(node).includes(path) && !targets.includes(node)) node.classList.add('pt-changed');
    say(pending.size ? `${pending.size} unsaved change${pending.size === 1 ? '' : 's'}` : '');
    refresh();
  };

  // ---- The panel ----
  const fieldControl = (path: string, info: FieldInfo): HTMLElement => {
    const id = `pt-ve-${path.replace(/[^a-z0-9]/gi, '-')}`;
    const value = current(path);
    const label = el('label', { className: 'pt-ve-label', text: info.label, attrs: { for: id } });
    let control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (info.kind === 'check') {
      const box = el('input', { attrs: { type: 'checkbox', id } });
      box.checked = value === true;
      box.addEventListener('change', () => setValue(path, box.checked));
      return el('div', { className: 'pt-ve-field check' }, [box, label]);
    }
    if (info.kind === 'textarea' || info.kind === 'lines') {
      const area = el('textarea', { attrs: { id, rows: String(Math.min(8, Math.max(3, String(value).split('\n').length + 1))) } });
      area.value = String(value);
      control = area;
    } else if (info.kind === 'select') {
      const select = el('select', { attrs: { id } }, [
        el('option', { text: 'Default', attrs: { value: '' } }),
        ...(info.options ?? []).map(([key, text]) => el('option', { text, attrs: { value: key } })),
      ]);
      select.value = String(value);
      control = select;
    } else {
      const input = el('input', {
        attrs: { id, type: info.kind === 'url' ? 'url' : info.kind === 'color' ? 'color' : 'text', autocomplete: 'off' },
      });
      if (info.kind === 'image') input.setAttribute('list', 'pt-ve-images');
      input.value = String(value);
      control = input;
    }
    if (info.placeholder && !(control instanceof HTMLSelectElement)) control.placeholder = decode(info.placeholder);
    control.addEventListener('input', () => setValue(path, control.value));
    const hint = info.hint
      ? el('small', { className: 'pt-ve-hint', text: info.hint })
      : info.kind === 'image'
        ? el('small', { className: 'pt-ve-hint', text: 'An image id from Media. The new photo shows after saving.' })
        : info.placeholder
          ? el('small', { className: 'pt-ve-hint', text: 'Clear the box to go back to the standard wording.' })
          : null;
    return el('div', { className: 'pt-ve-field' }, [label, control, hint]);
  };

  const close = () => {
    panel.hidden = true;
    selected?.classList.remove('pt-selected');
    selected = null;
  };
  const open = (node: Element) => {
    const paths = pathsOf(node).filter(path => catalog.fields[path]);
    close();
    if (!paths.length) {
      say('This part can’t be edited here yet.', 'error');
      return;
    }
    selected = node;
    node.classList.add('pt-selected');
    const first = catalog.fields[paths[0]];
    const title = paths.length === 1 ? first.label : 'Edit';
    const closeButton = el('button', { className: 'pt-ve-close', text: 'Close', attrs: { type: 'button' } });
    closeButton.addEventListener('click', close);
    panel.replaceChildren(
      el('div', { className: 'pt-ve-head' }, [el('h2', { text: title }), closeButton]),
      el(
        'div',
        { className: 'pt-ve-fields' },
        paths.map(path => fieldControl(path, catalog.fields[path])),
      ),
    );
    panel.hidden = false;
    panel.querySelector<HTMLElement>('input, textarea, select')?.focus();
  };

  // ---- Edit mode: clicks select instead of following links, opening FAQs or submitting forms ----
  const onClick = (event: MouseEvent) => {
    if (!editing) return;
    const target = event.target as Element | null;
    if (!target || bar.contains(target) || panel.contains(target)) return;
    event.preventDefault();
    event.stopPropagation();
    const node = target.closest(`[${ATTR}]`);
    if (node) open(node);
    else close();
  };
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('submit', event => editing && event.preventDefault(), true);
  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) close();
  });

  toggle.addEventListener('click', () => {
    editing = !editing;
    if (!editing) close();
    say(editing ? 'Click any outlined text or photo to edit it.' : pending.size ? 'You have unsaved changes.' : '');
    refresh();
  });

  discard.addEventListener('click', () => {
    for (const [node, text] of originals) node.textContent = text;
    originals.clear();
    pending.clear();
    for (const node of doc.querySelectorAll('.pt-changed')) node.classList.remove('pt-changed');
    close();
    say('Changes discarded.');
    refresh();
  });

  save.addEventListener('click', async () => {
    if (!pending.size) return;
    save.disabled = true;
    save.textContent = 'Saving…';
    const values = Object.fromEntries([...pending].map(([path, value]) => [path, typeof value === 'string' ? encode(value) : value]));
    const result = await fetch(API, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': catalog.csrf },
      body: JSON.stringify({ values }),
    })
      .then(res => res.json() as Promise<SaveResult>)
      .catch((): SaveResult => ({ ok: false, problems: ['The CMS could not be reached. Check your connection and try again.'] }));
    save.textContent = 'Save';
    if (!result.ok) {
      say(`Not saved: ${(result.problems ?? ['Sign in to the CMS again.']).join(' ')}`, 'error');
      refresh();
      return;
    }
    for (const [path, value] of pending)
      if (catalog.fields[path]) catalog.fields[path].value = typeof value === 'string' ? encode(value) : value;
    pending.clear();
    originals.clear();
    for (const node of doc.querySelectorAll('.pt-changed')) node.classList.remove('pt-changed');
    say(result.message ?? 'Saved.', 'ok');
    refresh();
  });

  if (autoEdit) {
    editing = true;
    say('Click any outlined text or photo to edit it.');
  }
  refresh();
}
