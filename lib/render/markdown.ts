// A small, safe markdown parser for the legal pages: headings, paragraphs, lists (nested by indentation), tables,
// **bold**, *italic* and [links](url). It returns a tree that components/markdown.tsx renders with React, so every
// piece of text is escaped by React and raw HTML is never passed through. The one exception is the `<br>` line break
// inside table cells (a common markdown idiom the legal source uses), which becomes a break node, never HTML.

export type Inline =
  | { type: 'text'; value: string }
  | { type: 'strong' | 'em'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'break' };

export interface ListItem {
  children: Inline[];
  lists: ListBlock[];
}
export interface ListBlock {
  type: 'list';
  ordered: boolean;
  items: ListItem[];
}
export type Block =
  | { type: 'heading'; level: number; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | ListBlock
  | { type: 'table'; head: Inline[][]; rows: Inline[][][] };

/** Only web, mail and same-site links survive; anything else (javascript:, data:, …) renders as plain text. */
export const safeHref = (href: string): string | null => (/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href.trim()) ? href.trim() : null);

export function parseInline(text: string, { breaks = false } = {}): Inline[] {
  const out: Inline[] = [];
  const pattern = breaks
    ? /\*\*(.+?)\*\*|\*(?!\s)(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)|<br\s*\/?>/gi
    : /\*\*(.+?)\*\*|\*(?!\s)(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ type: 'text', value: text.slice(last, at) });
    const [whole, strong, em, label, href] = match;
    if (strong !== undefined) out.push({ type: 'strong', children: parseInline(strong, { breaks }) });
    else if (em !== undefined) out.push({ type: 'em', children: parseInline(em, { breaks }) });
    else if (label !== undefined) {
      const safe = safeHref(href);
      out.push(safe ? { type: 'link', href: safe, children: parseInline(label, { breaks }) } : { type: 'text', value: whole });
    } else out.push({ type: 'break' });
    last = at + whole.length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => parseInline(cell.trim(), { breaks: true }));
const width = (indent: string) => indent.replace(/\t/g, '    ').length;

export function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2]) });
      i += 1;
      continue;
    }
    if (line.trim().startsWith('|') && TABLE_SEPARATOR.test(lines[i + 1] ?? '')) {
      const head = cells(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      blocks.push({ type: 'table', head, rows });
      continue;
    }
    if (LIST_ITEM.test(line)) {
      // Items at a deeper indent than the list's first item nest under the previous item; blank lines don't end a list.
      const root: ListBlock = { type: 'list', ordered: /\d/.test(LIST_ITEM.exec(line)?.[2] ?? ''), items: [] };
      const stack: { indent: number; list: ListBlock }[] = [{ indent: width(LIST_ITEM.exec(line)?.[1] ?? ''), list: root }];
      while (i < lines.length) {
        const current = lines[i];
        if (current.trim() === '') {
          const next = lines.slice(i + 1).find(candidate => candidate.trim() !== '');
          if (next !== undefined && LIST_ITEM.test(next)) {
            i += 1;
            continue;
          }
          break;
        }
        const item = LIST_ITEM.exec(current);
        if (!item) {
          // A continuation line belongs to the last item.
          const top = stack[stack.length - 1].list;
          const last = top.items[top.items.length - 1];
          if (!last || HEADING.test(current) || current.trim().startsWith('|')) break;
          last.children.push({ type: 'text', value: ' ' }, ...parseInline(current.trim()));
          i += 1;
          continue;
        }
        const indent = width(item[1]);
        // A top-level item of the other kind (bullets vs numbers) starts a new list.
        if (indent <= stack[0].indent && /\d/.test(item[2]) !== root.ordered) break;
        while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop();
        let top = stack[stack.length - 1];
        if (indent > top.indent && top.list.items.length > 0) {
          const nested: ListBlock = { type: 'list', ordered: /\d/.test(item[2]), items: [] };
          top.list.items[top.list.items.length - 1].lists.push(nested);
          top = { indent, list: nested };
          stack.push(top);
        }
        top.list.items.push({ children: parseInline(item[3]), lists: [] });
        i += 1;
      }
      blocks.push(root);
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !HEADING.test(lines[i]) && !LIST_ITEM.test(lines[i])) {
      if (lines[i].trim().startsWith('|') && TABLE_SEPARATOR.test(lines[i + 1] ?? '')) break;
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: 'paragraph', children: parseInline(paragraph.join(' ')) });
  }
  return blocks;
}
