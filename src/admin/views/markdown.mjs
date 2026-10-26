// Renders a verify list (verify.md from a site pack) as safe HTML: everything is escaped first, then only headings,
// bullets, paragraphs, **bold** and `code` are recognised. Raw HTML in the file always shows as text.
import { esc } from './html.mjs';

const inline = text =>
  esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

export function markdown(source) {
  const out = [];
  let list = false;
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) out.push('</ul>');
    list = false;
  };
  for (const raw of String(source).split(/\r?\n/)) {
    const line = raw.trim();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (heading) {
      flush();
      closeList();
      out.push(`<h${Math.min(heading[1].length + 2, 6)}>${inline(heading[2])}</h${Math.min(heading[1].length + 2, 6)}>`);
    } else if (bullet) {
      flush();
      if (!list) out.push('<ul>');
      list = true;
      out.push(`<li>${inline(bullet[1])}</li>`);
    } else if (!line) {
      flush();
      closeList();
    } else {
      closeList();
      paragraph.push(line);
    }
  }
  flush();
  closeList();
  return out.join('\n');
}
