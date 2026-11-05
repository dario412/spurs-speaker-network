// The CMS's visual editor on the live pages, like the Credible Creators CMS: an "Edit page" bar for signed-in
// editors; in edit mode every element marked with data-edit (components/site/primitives.tsx → edit()) is outlined,
// and clicking one opens a panel with its fields. Text, link labels and photos update on the page as you edit; the
// hero carousel and the featured speakers are edited as lists (add, remove, reorder). Save sends the changes to
// /admin/api/visual, which validates and saves them like the page editors (lib/cms/web.ts).
//
// Loaded only when the CMS's marker cookie is present or the page was opened with ?edit=1 (components/behaviour.tsx).
// Builds every node with DOM calls (Trusted Types forbid HTML strings) and styles with classes from
// /admin/assets/visual-editor.css (no inline styles).
import { decode } from '../render/text.ts';

type Value = string | boolean | unknown[];

interface FieldInfo {
  label: string;
  kind: string;
  hint?: string;
  placeholder?: string;
  options?: [string, string][];
  page: string;
  value: Value;
}

interface LibraryImage {
  id: string;
  url: string;
  usedBy: string[];
}

interface Speaker {
  slug: string;
  name: string;
  image: string | null;
}

interface Slide {
  image: string;
  name: string;
  line: string;
}

interface Catalog {
  canEdit: boolean;
  csrf: string;
  page: string | null;
  tokens: Record<string, string | undefined>;
  filled: string[];
  images: LibraryImage[];
  speakers: Speaker[];
  fields: Record<string, FieldInfo>;
}

interface SaveResult {
  ok: boolean;
  message?: string;
  problems?: string[];
  image?: LibraryImage;
}

const API = '/admin/api/visual';
const UPLOAD = '/admin/api/visual/upload';
const ATTR = 'data-edit';
const IMAGE_ATTR = 'data-edit-image';
/** While the hero follows the speakers, the featured list is edited; otherwise the hero photos and slides. */
const WHEN_SPEAKERS = new Set(['featured']);
const WHEN_OWN_PHOTOS = new Set([
  'home.hero.image',
  'home.hero.name',
  'home.hero.line',
  'home.inset.image',
  'home.inset.name',
  'home.inset.line',
  'home.slides',
]);

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

const button = (text: string, className = 'pt-ve-btn', label?: string) =>
  el('button', { className, text, attrs: { type: 'button', ...(label ? { 'aria-label': label } : {}) } });

/** Stored content is "HTML text" (`&amp;` for &): the editor shows plain text and stores the canonical form. */
const encode = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const pathsOf = (node: Element) => (node.getAttribute(ATTR) ?? '').split(' ').filter(Boolean);
/** An element's own text (its direct text nodes): a link's label without its arrow or screen-reader text. */
const ownTextNodes = (node: Element) =>
  [...node.childNodes].filter((child): child is Text => child instanceof Text && Boolean(child.data.trim()));
const ownText = (node: Element) =>
  ownTextNodes(node)
    .map(text => text.data)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

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

  const library = new Map(catalog.images.map(image => [image.id, image]));
  const speakers = new Map(catalog.speakers.map(speaker => [speaker.slug, speaker]));
  /** Unsaved values by path. */
  const pending = new Map<string, Value>();
  /** What changed on the page, to restore on Discard: text nodes and photos. */
  const textOriginals = new Map<Text, string>();
  const photoOriginals = new Map<HTMLImageElement, { src: string; srcset: string | null; sizes: string | null }>();
  let editing = false;
  let selected: Element | null = null;

  const shown = (path: string, value: Value): string => {
    const info = catalog.fields[path];
    let text = typeof value === 'string' ? value : '';
    if (!text && info?.placeholder) text = decode(info.placeholder);
    if (catalog.filled.includes(path))
      text = text.replace(/\{(\w+)\}/g, (match, name: string) => decode(catalog.tokens[name] ?? '') || match);
    return text;
  };
  /** The saved value as the editor shows it: wording still on the standard text starts from that text. */
  const baseline = (path: string): Value => {
    const info = catalog.fields[path];
    const value = info?.value ?? '';
    if (typeof value !== 'string') return value;
    return value === '' && info?.placeholder ? decode(info.placeholder) : decode(value);
  };
  const current = (path: string): Value => (pending.has(path) ? (pending.get(path) as Value) : baseline(path));

  // ---- The bar ----
  const toggle = button('Edit page', 'pt-ve-btn primary');
  const save = button('Save', 'pt-ve-btn primary');
  const discard = button('Discard');
  const full = el('a', {
    className: 'pt-ve-link',
    text: 'Full editor',
    attrs: { href: catalog.page ? `/admin/pages/${catalog.page}` : '/admin/pages' },
  });
  const cms = el('a', { className: 'pt-ve-link', text: 'CMS', attrs: { href: '/admin' } });
  const message = el('p', { className: 'pt-ve-msg', attrs: { role: 'status', 'aria-live': 'polite' } });
  const tools = el('span', { className: 'pt-ve-tools' }, [save, discard, full]);
  const bar = el('div', { className: 'pt-ve-bar', attrs: { role: 'region', 'aria-label': 'Page editor' } }, [toggle, tools, cms, message]);
  const panel = el('div', { className: 'pt-ve-panel', attrs: { role: 'dialog', 'aria-label': 'Edit content' } });
  panel.hidden = true;
  const picker = el('div', { className: 'pt-ve-picker', attrs: { role: 'dialog', 'aria-label': 'Choose a photo' } });
  picker.hidden = true;
  doc.body.append(bar, panel, picker);

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
  /** Elements whose own text is exactly one field's value: their text is replaced as you type. */
  const liveTargets = (path: string) =>
    [...doc.querySelectorAll(`[${ATTR}]`)].filter(node => {
      const list = pathsOf(node);
      if (list.length !== 1 || list[0] !== path) return false;
      if (ownTextNodes(node).some(text => textOriginals.has(text))) return true;
      return ownText(node) === shown(path, current(path)).replace(/\s+/g, ' ').trim();
    });
  const showText = (node: Element, text: string) => {
    const nodes = ownTextNodes(node);
    for (const [i, textNode] of nodes.entries()) {
      if (!textOriginals.has(textNode)) textOriginals.set(textNode, textNode.data);
      // Keep the spacing around the label (before an arrow or screen-reader text).
      const original = textOriginals.get(textNode) ?? '';
      textNode.data = i === 0 ? `${/^\s/.test(original) ? ' ' : ''}${text}${/\s$/.test(original) ? ' ' : ''}` : '';
    }
  };
  const showPhoto = (path: string, id: string) => {
    const url = library.get(id)?.url;
    if (!url) return;
    for (const holder of doc.querySelectorAll(`[${IMAGE_ATTR}="${CSS.escape(path)}"]`)) {
      const img = holder.querySelector<HTMLImageElement>(':scope > img');
      if (!img) continue;
      if (!photoOriginals.has(img))
        photoOriginals.set(img, { src: img.src, srcset: img.getAttribute('srcset'), sizes: img.getAttribute('sizes') });
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.src = url;
    }
  };
  const setValue = (path: string, value: Value) => {
    const kind = catalog.fields[path]?.kind;
    const targets = kind === 'image' || Array.isArray(value) || typeof value === 'boolean' ? [] : liveTargets(path);
    const unchanged = same(value, baseline(path));
    if (unchanged) pending.delete(path);
    else pending.set(path, value);
    for (const node of targets) {
      showText(node, shown(path, value));
      node.classList.toggle('pt-changed', !unchanged);
    }
    if (kind === 'image' && typeof value === 'string') showPhoto(path, value);
    for (const node of doc.querySelectorAll(`[${ATTR}]`))
      if (pathsOf(node).includes(path) && !targets.includes(node)) node.classList.toggle('pt-changed', !unchanged);
    say(pending.size ? `${pending.size} unsaved change${pending.size === 1 ? '' : 's'}` : '');
    refresh();
  };

  // ---- The photo picker ----
  let onPick: ((id: string) => void) | null = null;
  const closePicker = () => {
    picker.hidden = true;
    onPick = null;
  };
  const openPicker = (pick: (id: string) => void, currentId = '') => {
    onPick = pick;
    const search = el('input', { attrs: { type: 'search', placeholder: 'Search by speaker or id', 'aria-label': 'Search photos' } });
    const file = el('input', { attrs: { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'aria-label': 'Upload a photo' } });
    const uploadLabel = el('label', { className: 'pt-ve-btn', text: 'Upload new' }, [file]);
    const grid = el('div', { className: 'pt-ve-grid' });
    const status = el('p', { className: 'pt-ve-hint' });
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      const items = [...library.values()].filter(
        image => !q || image.id.toLowerCase().includes(q) || image.usedBy.some(use => use.toLowerCase().includes(q)),
      );
      grid.replaceChildren(
        ...items.slice(0, 120).map(image => {
          const tile = el('button', { className: `pt-ve-tile${image.id === currentId ? ' current' : ''}`, attrs: { type: 'button' } }, [
            el('img', { attrs: { src: image.url, alt: '', loading: 'lazy' } }),
            el('span', { text: image.usedBy[0] ?? image.id }),
          ]);
          tile.addEventListener('click', () => {
            onPick?.(image.id);
            closePicker();
          });
          return tile;
        }),
      );
      status.textContent = items.length > 120 ? `Showing 120 of ${items.length}: search to narrow down.` : `${items.length} photos`;
    };
    search.addEventListener('input', draw);
    file.addEventListener('change', async () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      status.textContent = 'Uploading…';
      const body = new FormData();
      body.append('file', chosen);
      body.append('alt', chosen.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '));
      const result = await fetch(UPLOAD, { method: 'POST', credentials: 'same-origin', headers: { 'x-csrf-token': catalog.csrf }, body })
        .then(res => res.json() as Promise<SaveResult>)
        .catch((): SaveResult => ({ ok: false, problems: ['The upload failed. Check your connection and try again.'] }));
      if (!result.ok || !result.image) {
        status.textContent = `Not uploaded: ${(result.problems ?? []).join(' ')}`;
        return;
      }
      library.set(result.image.id, result.image);
      onPick?.(result.image.id);
      closePicker();
      say('Photo uploaded. Save to use it on the page.', 'ok');
    });
    const closeButton = button('Close', 'pt-ve-close');
    closeButton.addEventListener('click', closePicker);
    picker.replaceChildren(
      el('div', { className: 'pt-ve-picker-box' }, [
        el('div', { className: 'pt-ve-head' }, [el('h2', { text: 'Choose a photo' }), closeButton]),
        el('div', { className: 'pt-ve-picker-tools' }, [search, uploadLabel]),
        status,
        grid,
      ]),
    );
    draw();
    picker.hidden = false;
    search.focus();
  };

  const photoButton = (id: string, onChange: (id: string) => void) => {
    const thumb = el('img', { className: 'pt-ve-thumb', attrs: { alt: '' } });
    const caption = el('small', { className: 'pt-ve-hint' });
    const show = (value: string) => {
      const image = library.get(value);
      if (image) thumb.src = image.url;
      thumb.hidden = !image;
      caption.textContent = image ? (image.usedBy[0] ?? image.id) : 'No photo';
    };
    const choose = button('Choose photo');
    let value = id;
    choose.addEventListener('click', () =>
      openPicker(next => {
        value = next;
        show(next);
        onChange(next);
      }, value),
    );
    show(id);
    return el('div', { className: 'pt-ve-photo' }, [thumb, el('div', {}, [caption, choose])]);
  };

  // ---- The panel's controls ----
  const fieldControl = (path: string, info: FieldInfo): HTMLElement => {
    const id = `pt-ve-${path.replace(/[^a-z0-9]/gi, '-')}`;
    const value = current(path);
    const label = el('label', { className: 'pt-ve-label', text: info.label, attrs: { for: id } });
    const hint = info.hint
      ? el('small', { className: 'pt-ve-hint', text: info.hint })
      : info.kind === 'text' && info.placeholder
        ? el('small', { className: 'pt-ve-hint', text: 'Clear the box to go back to the standard wording.' })
        : null;
    const wrap = (children: (Node | null)[], className = 'pt-ve-field') => {
      const field = el('div', { className, attrs: { 'data-path': path } }, children);
      if (WHEN_SPEAKERS.has(path)) field.dataset.when = 'speakers';
      if (WHEN_OWN_PHOTOS.has(path)) field.dataset.when = 'own';
      return field;
    };

    if (info.kind === 'check') {
      const box = el('input', { attrs: { type: 'checkbox', id } });
      box.checked = value === true;
      box.addEventListener('change', () => {
        setValue(path, box.checked);
        updateVisibility();
      });
      return wrap([el('div', { className: 'pt-ve-inline' }, [box, label]), hint]);
    }
    if (info.kind === 'image')
      return wrap([
        el('span', { className: 'pt-ve-label', text: info.label }),
        photoButton(String(value), next => setValue(path, next)),
        hint,
      ]);
    if (info.kind === 'slides') return wrap([el('span', { className: 'pt-ve-label', text: info.label }), slidesControl(path), hint]);
    if (info.kind === 'speakers') return wrap([el('span', { className: 'pt-ve-label', text: info.label }), speakersControl(path), hint]);

    let control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
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
      input.value = String(value);
      control = input;
    }
    if (info.placeholder && !(control instanceof HTMLSelectElement)) control.placeholder = decode(info.placeholder);
    control.addEventListener('input', () => setValue(path, control.value));
    return wrap([label, control, hint]);
  };

  /** The carousel slides: photo, name and caption per slide; add, remove and reorder. */
  function slidesControl(path: string): HTMLElement {
    let rows = (current(path) as Slide[]).map(row => ({ image: row.image, name: decode(row.name), line: decode(row.line) }));
    const list = el('ol', { className: 'pt-ve-list' });
    const commit = () =>
      setValue(
        path,
        rows.map(row => ({ ...row })),
      );
    const draw = () => {
      list.replaceChildren(
        ...rows.map((row, i) => {
          const name = el('input', { attrs: { type: 'text', 'aria-label': `Slide ${i + 1} name`, placeholder: 'Name' } });
          name.value = row.name;
          name.addEventListener('input', () => {
            rows[i].name = name.value;
            commit();
          });
          const line = el('input', { attrs: { type: 'text', 'aria-label': `Slide ${i + 1} caption`, placeholder: 'Caption' } });
          line.value = row.line;
          line.addEventListener('input', () => {
            rows[i].line = line.value;
            commit();
          });
          const up = button('↑', 'pt-ve-mini', `Move slide ${i + 1} up`);
          const down = button('↓', 'pt-ve-mini', `Move slide ${i + 1} down`);
          const remove = button('Remove', 'pt-ve-mini danger', `Remove slide ${i + 1}`);
          up.disabled = i === 0;
          down.disabled = i === rows.length - 1;
          up.addEventListener('click', () => {
            [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
            commit();
            draw();
          });
          down.addEventListener('click', () => {
            [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]];
            commit();
            draw();
          });
          remove.addEventListener('click', () => {
            rows = rows.filter((_, j) => j !== i);
            commit();
            draw();
          });
          return el('li', { className: 'pt-ve-row' }, [
            photoButton(row.image, next => {
              rows[i].image = next;
              commit();
            }),
            name,
            line,
            el('div', { className: 'pt-ve-row-tools' }, [up, down, remove]),
          ]);
        }),
      );
    };
    const add = button('Add a slide');
    add.addEventListener('click', () =>
      openPicker(id => {
        const image = library.get(id);
        rows.push({ image: id, name: image?.usedBy[0] ?? '', line: '' });
        commit();
        draw();
      }),
    );
    draw();
    return el('div', {}, [list, add]);
  }

  /** The featured speakers, in order: pick from the listed speakers, remove and reorder. */
  function speakersControl(path: string): HTMLElement {
    let slugs = (current(path) as string[]).filter(slug => speakers.has(slug));
    const list = el('ol', { className: 'pt-ve-list' });
    const addSelect = el('select', { attrs: { 'aria-label': 'Add a speaker' } });
    const commit = () => setValue(path, [...slugs]);
    const draw = () => {
      list.replaceChildren(
        ...slugs.map((slug, i) => {
          const speaker = speakers.get(slug) as Speaker;
          const up = button('↑', 'pt-ve-mini', `Move ${speaker.name} up`);
          const down = button('↓', 'pt-ve-mini', `Move ${speaker.name} down`);
          const remove = button('Remove', 'pt-ve-mini danger', `Remove ${speaker.name}`);
          up.disabled = i === 0;
          down.disabled = i === slugs.length - 1;
          up.addEventListener('click', () => {
            [slugs[i - 1], slugs[i]] = [slugs[i], slugs[i - 1]];
            commit();
            draw();
          });
          down.addEventListener('click', () => {
            [slugs[i + 1], slugs[i]] = [slugs[i], slugs[i + 1]];
            commit();
            draw();
          });
          remove.addEventListener('click', () => {
            slugs = slugs.filter(other => other !== slug);
            commit();
            draw();
          });
          return el('li', { className: 'pt-ve-row speaker' }, [
            speaker.image ? el('img', { className: 'pt-ve-thumb', attrs: { src: speaker.image, alt: '' } }) : null,
            el('span', { className: 'pt-ve-name', text: speaker.name }),
            el('div', { className: 'pt-ve-row-tools' }, [up, down, remove]),
          ]);
        }),
      );
      addSelect.replaceChildren(
        el('option', { text: 'Add a speaker…', attrs: { value: '' } }),
        ...[...speakers.values()]
          .filter(speaker => !slugs.includes(speaker.slug))
          .map(speaker => el('option', { text: speaker.name, attrs: { value: speaker.slug } })),
      );
    };
    addSelect.addEventListener('change', () => {
      if (!addSelect.value) return;
      slugs.push(addSelect.value);
      commit();
      draw();
    });
    draw();
    return el('div', {}, [list, addSelect]);
  }

  /** Hero panel: the featured list while the hero follows the speakers, the hero photos and slides otherwise. */
  function updateVisibility() {
    const fromSpeakers = current('home.fromSpeakers') === true;
    for (const field of panel.querySelectorAll<HTMLElement>('[data-when]'))
      field.hidden = field.dataset.when === 'speakers' ? !fromSpeakers : fromSpeakers;
  }

  const close = () => {
    panel.hidden = true;
    closePicker();
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
    const hero = paths.includes('home.fromSpeakers') || paths.includes('home.slides');
    const title = hero ? 'Hero & carousel' : paths.length === 1 ? catalog.fields[paths[0]].label : 'Edit';
    const closeButton = button('Close', 'pt-ve-close');
    closeButton.addEventListener('click', close);
    const ordered = hero
      ? ['home.fromSpeakers', ...paths.filter(path => path !== 'home.fromSpeakers')].filter(path => catalog.fields[path])
      : paths;
    panel.replaceChildren(
      el('div', { className: 'pt-ve-head' }, [el('h2', { text: title }), closeButton]),
      el(
        'div',
        { className: 'pt-ve-fields' },
        [...new Set(ordered)].map(path => fieldControl(path, catalog.fields[path])),
      ),
    );
    updateVisibility();
    panel.hidden = false;
    panel.querySelector<HTMLElement>('input:not([type="checkbox"]), textarea, select, button.pt-ve-btn')?.focus();
  };

  // ---- Edit mode: clicks select instead of following links, opening FAQs or submitting forms ----
  const onClick = (event: MouseEvent) => {
    if (!editing) return;
    const target = event.target as Element | null;
    if (!target || bar.contains(target) || panel.contains(target) || picker.contains(target)) return;
    event.preventDefault();
    event.stopPropagation();
    const node = target.closest(`[${ATTR}]`);
    if (node) open(node);
    else close();
  };
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('submit', event => editing && event.preventDefault(), true);
  doc.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!picker.hidden) closePicker();
    else if (!panel.hidden) close();
  });

  toggle.addEventListener('click', () => {
    editing = !editing;
    if (!editing) close();
    say(editing ? 'Click any outlined text, link or photo to edit it.' : pending.size ? 'You have unsaved changes.' : '');
    refresh();
  });

  const restore = () => {
    for (const [text, data] of textOriginals) text.data = data;
    for (const [img, original] of photoOriginals) {
      img.src = original.src;
      if (original.srcset !== null) img.setAttribute('srcset', original.srcset);
      if (original.sizes !== null) img.setAttribute('sizes', original.sizes);
    }
    textOriginals.clear();
    photoOriginals.clear();
  };

  discard.addEventListener('click', () => {
    restore();
    pending.clear();
    for (const node of doc.querySelectorAll('.pt-changed')) node.classList.remove('pt-changed');
    close();
    say('Changes discarded.');
    refresh();
  });

  /** The stored form of a value: text as HTML text, slide names and captions too. */
  const stored = (value: Value): Value => {
    if (typeof value === 'string') return encode(value);
    if (Array.isArray(value))
      return value.map(item =>
        item && typeof item === 'object'
          ? Object.fromEntries(
              Object.entries(item as Record<string, unknown>).map(([key, v]) => [key, key === 'image' ? v : encode(String(v ?? ''))]),
            )
          : item,
      );
    return value;
  };

  save.addEventListener('click', async () => {
    if (!pending.size) return;
    save.disabled = true;
    save.textContent = 'Saving…';
    const values = Object.fromEntries([...pending].map(([path, value]) => [path, stored(value)]));
    const lists = [...pending.keys()].some(path => ['home.slides', 'featured', 'home.fromSpeakers'].includes(path));
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
      say(`Not saved: ${(result.problems ?? ['Sign in to the CMS again.']).map(p => p.replace(/^[a-z0-9-]+: /, '')).join(' ')}`, 'error');
      refresh();
      return;
    }
    for (const [path, value] of pending) if (catalog.fields[path]) catalog.fields[path].value = stored(value);
    pending.clear();
    textOriginals.clear();
    photoOriginals.clear();
    for (const node of doc.querySelectorAll('.pt-changed')) node.classList.remove('pt-changed');
    say(`${result.message ?? 'Saved.'}${lists ? ' Reload the page in a minute to see the new carousel.' : ''}`, 'ok');
    refresh();
  });

  if (autoEdit) {
    editing = true;
    say('Click any outlined text, link or photo to edit it.');
  }
  refresh();
}
