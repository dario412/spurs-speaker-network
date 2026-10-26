// Content strings are authored as "trusted HTML text": plain text where `&amp;` stands for `&` (see docs/content-model.md).
// React escapes text itself, so the renderer decodes character references once and never injects HTML.
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export const decode = (value: string): string =>
  value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (match, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? Number.parseInt(ref.slice(2), 16) : Number.parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED[ref.toLowerCase()] ?? match;
  });

type Decoded<T> = T extends string
  ? string
  : T extends (infer U)[]
    ? Decoded<U>[]
    : T extends object
      ? { [K in keyof T]: Decoded<T[K]> }
      : T;

/** Decodes every string in a JSON-like value (objects, arrays, strings). */
export function decodeDeep<T>(value: T): Decoded<T> {
  if (typeof value === 'string') return decode(value) as Decoded<T>;
  if (Array.isArray(value)) return value.map(decodeDeep) as Decoded<T>;
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeDeep(item)])) as Decoded<T>;
  return value as Decoded<T>;
}
