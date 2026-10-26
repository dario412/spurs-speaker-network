// Renders parsed legal markdown (lib/render/markdown.ts) to React elements. Text only ever becomes React text
// (escaped by React); no raw HTML is passed through. Headings shift so the document's top level becomes <h2> under
// the page's <h1>, without skipping levels. Written with createElement (no JSX) so the tests can render it with react-dom/server directly.
import { createElement as h, type ReactNode } from 'react';
import { type Block, type Inline, type ListBlock, parseMarkdown } from './markdown.ts';

function inlines(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return node.value;
      case 'break':
        return h('br', { key: i });
      case 'strong':
      case 'em':
        return h(node.type, { key: i }, ...inlines(node.children));
      case 'link':
        return h('a', { key: i, href: node.href, rel: /^https?:/.test(node.href) ? 'noopener' : undefined }, ...inlines(node.children));
      default:
        return null;
    }
  });
}

function list(block: ListBlock, key: number): ReactNode {
  return h(
    block.ordered ? 'ol' : 'ul',
    { key },
    block.items.map((item, i) => h('li', { key: i }, ...inlines(item.children), ...item.lists.map((nested, j) => list(nested, j)))),
  );
}

function block(node: Block, key: number, level: number): ReactNode {
  switch (node.type) {
    case 'heading':
      return h(`h${level}`, { key }, ...inlines(node.children));
    case 'paragraph':
      return h('p', { key }, ...inlines(node.children));
    case 'list':
      return list(node, key);
    case 'table':
      return h(
        'div',
        { key, className: 'table-scroll' },
        h(
          'table',
          null,
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              node.head.map((cell, i) => h('th', { key: i, scope: 'col' }, ...inlines(cell))),
            ),
          ),
          h(
            'tbody',
            null,
            node.rows.map((row, r) =>
              h(
                'tr',
                { key: r },
                row.map((cell, c) => h('td', { key: c }, ...inlines(cell))),
              ),
            ),
          ),
        ),
      );
  }
}

/**
 * Page heading level for each markdown heading: the document's top level becomes <h2> (under the page's <h1>), and a
 * heading never goes more than one level deeper than the one before it, so the outline has no skipped levels.
 */
export function headingLevels(levels: number[]): number[] {
  const shift = (levels.length ? Math.min(...levels) : 2) - 2;
  const out: number[] = [];
  for (const level of levels) {
    const previous = out.length ? out[out.length - 1] : 1;
    out.push(Math.min(6, Math.max(2, Math.min(level - shift, previous + 1))));
  }
  return out;
}

export function renderMarkdown(source: string): ReactNode {
  const blocks = parseMarkdown(source);
  const levels = headingLevels(blocks.flatMap(node => (node.type === 'heading' ? [node.level] : [])));
  let next = 0;
  return blocks.map((node, i) => block(node, i, node.type === 'heading' ? levels[next++] : 0));
}
