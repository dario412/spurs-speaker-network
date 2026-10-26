// Turns the contract (schemas.ts) into JSON Schema files (draft 2020-12) and the Markdown field tables in
// docs/content-contract.md. Deterministic output: same input, byte-identical files, so CI can diff them.
import type { AnyNode, AnyOptional, Json, Spec } from './builder.ts';
import { ROOTS } from './schemas.ts';

export const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
export const schemaId = (file: string): string => `urn:peptalk-appearances:content:${file}`;

type JsonObject = { [key: string]: Json };

const unwrap = (value: AnyNode | AnyOptional): AnyNode => ('optional' in value ? value.node : value);

function collectRefs(node: AnyNode, into: Map<string, AnyNode>): void {
  const spec = node.spec;
  switch (spec.kind) {
    case 'ref':
      if (!into.has(spec.name)) {
        into.set(spec.name, spec.target);
        collectRefs(spec.target, into);
      }
      return;
    case 'array':
      collectRefs(spec.items, into);
      return;
    case 'tuple':
      for (const item of spec.items) collectRefs(item, into);
      return;
    case 'union':
      for (const item of spec.options) collectRefs(item, into);
      return;
    case 'object':
      for (const value of Object.values(spec.shape)) collectRefs(unwrap(value), into);
      return;
    case 'record':
      collectRefs(spec.values, into);
      return;
    default:
      return;
  }
}

function toJson(node: AnyNode): JsonObject {
  const spec: Spec = node.spec;
  const meta: JsonObject = {};
  if (node.meta.description) meta.description = node.meta.description;
  if (node.meta.default !== undefined) meta.default = node.meta.default;
  switch (spec.kind) {
    case 'string': {
      const { kind: _, ...constraints } = spec;
      return { type: 'string', ...constraints, ...meta };
    }
    case 'boolean':
      return { type: 'boolean', ...meta };
    case 'null':
      return { type: 'null', ...meta };
    case 'enum':
      return spec.values.length === 1 ? { const: spec.values[0], ...meta } : { enum: [...spec.values], ...meta };
    case 'array': {
      const out: JsonObject = { type: 'array', items: toJson(spec.items) };
      if (spec.minItems !== undefined) out.minItems = spec.minItems;
      if (spec.maxItems !== undefined) out.maxItems = spec.maxItems;
      if (spec.uniqueItems) out.uniqueItems = true;
      return { ...out, ...meta };
    }
    case 'tuple':
      return {
        type: 'array',
        prefixItems: spec.items.map(toJson),
        items: false,
        minItems: spec.items.length,
        maxItems: spec.items.length,
        ...meta,
      };
    case 'object': {
      const entries = Object.entries(spec.shape);
      const required = entries.filter(([, value]) => !('optional' in value)).map(([key]) => key);
      return {
        type: 'object',
        ...meta,
        properties: Object.fromEntries(entries.map(([key, value]) => [key, toJson(unwrap(value))])),
        ...(required.length ? { required } : {}),
        additionalProperties: false,
      };
    }
    case 'record':
      return {
        type: 'object',
        ...(spec.keyPattern ? { propertyNames: { pattern: spec.keyPattern } } : {}),
        additionalProperties: toJson(spec.values),
        ...meta,
      };
    case 'union':
      return { anyOf: spec.options.map(toJson), ...meta };
    case 'ref':
      return { $ref: `#/$defs/${spec.name}`, ...meta };
    case 'opaque':
      return { ...spec.json, ...meta };
  }
}

/** One self-contained JSON Schema document for a root shape (its named definitions under $defs). */
export function jsonSchemaFor(file: string, title: string, root: AnyNode): JsonObject {
  if (root.spec.kind !== 'ref') throw new Error(`${file}: a root must be a named definition`);
  const defs = new Map<string, AnyNode>();
  collectRefs(root, defs);
  return {
    $schema: DRAFT,
    $id: schemaId(file),
    title,
    $ref: `#/$defs/${root.spec.name}`,
    $defs: Object.fromEntries([...defs].sort(([a], [b]) => a.localeCompare(b)).map(([name, target]) => [name, toJson(target)])),
  };
}

/** The schema document for one root file name (`person`, `site`, …). */
export function schemaFor(file: (typeof ROOTS)[number]['file']): JsonObject {
  const root = ROOTS.find(entry => entry.file === file);
  if (!root) throw new Error(`Unknown schema "${file}"`);
  return jsonSchemaFor(root.file, root.title, root.node);
}

/** Every schema file: name -> serialised content (2-space JSON plus a trailing newline, like the content files). */
export function schemaFiles(): Record<string, string> {
  return Object.fromEntries(
    ROOTS.map(({ file, title, node }) => [`${file}.schema.json`, `${JSON.stringify(jsonSchemaFor(file, title, node), null, 2)}\n`]),
  );
}

function typeLabel(node: AnyNode): string {
  const spec = node.spec;
  if (node.meta.label) return node.meta.label;
  switch (spec.kind) {
    case 'string':
      return spec.format === 'date' ? 'date' : 'string';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'enum':
      return spec.values.map(value => `\`"${value}"\``).join(' \\| ');
    case 'array': {
      const exact = spec.minItems !== undefined && spec.minItems === spec.maxItems;
      const count = exact
        ? ` (exactly ${spec.minItems})`
        : spec.maxItems !== undefined
          ? ` (max ${spec.maxItems})`
          : spec.minItems
            ? ` (min ${spec.minItems})`
            : '';
      const inner = typeLabel(spec.items);
      return `${inner.includes(' ') ? `(${inner})` : inner}[]${count}`;
    }
    case 'tuple':
      return `[${spec.items.map(typeLabel).join(', ')}]`;
    case 'object':
      return `{ ${Object.entries(spec.shape)
        .map(([key, value]) => `${key}${'optional' in value ? '?' : ''}`)
        .join(', ')} }`;
    case 'record':
      return `{ [key]: ${typeLabel(spec.values)} }`;
    case 'union':
      return spec.options.map(typeLabel).join(' \\| ');
    case 'ref':
      return `[${spec.name}](#${spec.name.toLowerCase()})`;
    case 'opaque':
      return 'object';
  }
}

const cell = (value: string): string => value.replaceAll('|', '\\|').replaceAll('\n', ' ');

function objectTable(name: string, node: AnyNode): string[] {
  const spec = node.spec;
  const lines = [`### ${name}`, ''];
  if (node.meta.description) lines.push(node.meta.description, '');
  if (spec.kind !== 'object') {
    lines.push(`Type: ${typeLabel(node)}`, '');
    return lines;
  }
  lines.push('| Field | Type | Required | Default | Notes |', '|---|---|---|---|---|');
  for (const [key, value] of Object.entries(spec.shape)) {
    const inner = unwrap(value);
    const notes = inner.meta.description ?? (inner.spec.kind === 'ref' ? (inner.spec.target.meta.description ?? '') : '');
    const fallback = inner.meta.default !== undefined ? `\`${JSON.stringify(inner.meta.default)}\`` : '';
    lines.push(`| \`${key}\` | ${typeLabel(inner)} | ${'optional' in value ? 'no' : 'yes'} | ${fallback} | ${cell(notes)} |`);
  }
  lines.push('');
  return lines;
}

/** The generated "Field reference" section of docs/content-contract.md (between the schema markers). */
export function fieldReference(): string {
  const defs = new Map<string, AnyNode>();
  for (const { node } of ROOTS) collectRefs(node, defs);
  const lines = [
    '| Schema file | Root | Returned by |',
    '|---|---|---|',
    ...ROOTS.map(
      ({ file, title, method }) =>
        `| [\`schema/${file}.schema.json\`](../schema/${file}.schema.json) | [${title}](#${title.toLowerCase()}) | ${method} |`,
    ),
    '',
  ];
  const order = [...ROOTS.map(root => root.title), ...[...defs.keys()].sort()];
  for (const name of new Set(order)) {
    const target = defs.get(name);
    if (target) lines.push(...objectTable(name, target));
  }
  return lines.join('\n').trimEnd();
}

export const DOC_START = '<!-- schema:start (generated by `npm run schema`; do not edit by hand) -->';
export const DOC_END = '<!-- schema:end -->';

/** The doc with its generated section replaced. Throws if the markers are missing. */
export function withFieldReference(doc: string): string {
  const start = doc.indexOf(DOC_START);
  const end = doc.indexOf(DOC_END);
  if (start < 0 || end < start) throw new Error('docs/content-contract.md: schema markers are missing');
  return `${doc.slice(0, start + DOC_START.length)}\n\n${fieldReference()}\n\n${doc.slice(end)}`;
}
