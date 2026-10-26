// Checks every relative link in the repository's markdown: the target file exists and, for `file.md#anchor` or `#anchor`,
// the target has a heading with that anchor (GitHub's slugs). External links (http, https, mailto) are not fetched.
// Code blocks and inline code are skipped, so example paths in them aren't links. Run: npm run docs:links
// (part of npm run check). Exits 1 and lists every broken link.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'research', '.visual', '.perf', '.vercel']);

/** Every .md file in the repository, build output and dependencies excluded. */
function markdownFiles(dir = ROOT) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) || entry.name.startsWith('.next') ? [] : markdownFiles(join(dir, entry.name));
    return entry.name.endsWith('.md') ? [join(dir, entry.name)] : [];
  });
}

/** The text outside fenced code blocks, with inline code blanked out. */
const prose = text =>
  text.replace(/^(```|~~~)[\s\S]*?^\1/gm, block => block.replace(/[^\n]/g, ' ')).replace(/`[^`\n]*`/g, code => ' '.repeat(code.length));

/** GitHub's heading anchors: lowercase, punctuation dropped (inline code keeps its text), spaces to hyphens, duplicates numbered. */
function anchors(file) {
  const seen = new Map();
  const result = new Set();
  const text = readFileSync(file, 'utf8').replace(/^(```|~~~)[\s\S]*?^\1/gm, '');
  for (const [, heading] of text.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = heading
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-');
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    result.add(count ? `${base}-${count}` : base);
  }
  return result;
}

const problems = [];
const files = markdownFiles();
for (const file of files) {
  const text = prose(readFileSync(file, 'utf8'));
  const links = [
    ...[...text.matchAll(/\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map(match => [match[1], match.index]),
    ...[...text.matchAll(/^\s*\[[^\]]+\]:\s+(\S+)/gm)].map(match => [match[1], match.index]),
  ];
  for (const [target, index] of links) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue;
    const line = text.slice(0, index).split('\n').length;
    const where = `${relative(ROOT, file)}:${line}`;
    const [path, anchor] = target.split('#');
    const resolved = path ? resolve(dirname(file), decodeURIComponent(path)) : file;
    if (!existsSync(resolved)) {
      problems.push(`${where}: ${target} (no such file)`);
      continue;
    }
    if (anchor && statSync(resolved).isFile() && resolved.endsWith('.md') && !anchors(resolved).has(anchor))
      problems.push(`${where}: ${target} (no heading #${anchor})`);
  }
}

if (problems.length) {
  console.error(`Broken markdown links (${problems.length}):\n${problems.map(problem => `  ${problem}`).join('\n')}`);
  process.exit(1);
}
console.log(`Markdown links: ${files.length} files checked, no broken relative links or anchors.`);
