// A small, strict JSON Schema (draft 2020-12) validator for the subset the contract emits. Dependency-free so the
// conformance suite runs anywhere; an unsupported keyword throws (fail closed) instead of being ignored. Any standard
// validator (Ajv in 2020 mode, for example) accepts the same files, if a CMS team prefers one.
import type { Json } from './builder.ts';

export interface SchemaError {
  /** JSON Pointer into the value, e.g. `/people/3/stats`. */
  path: string;
  message: string;
}

type Schema = { [key: string]: Json } | boolean;

const ANNOTATIONS = new Set(['$schema', '$id', 'title', 'description', 'default', 'examples', '$comment', '$defs']);
const SUPPORTED = new Set([
  ...ANNOTATIONS,
  ...['$ref', 'type', 'enum', 'const', 'pattern', 'minLength', 'maxLength', 'format', 'properties', 'required'],
  ...['additionalProperties', 'propertyNames', 'items', 'prefixItems', 'minItems', 'maxItems', 'uniqueItems', 'anyOf'],
]);

const typeOf = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
};

const matchesType = (value: unknown, type: string): boolean =>
  type === 'number' ? typeof value === 'number' : type === 'integer' ? Number.isInteger(value) : typeOf(value) === type;

const pointer = (path: string, key: string | number): string => `${path}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;

/** Validates `value` against a root schema document. Returns every problem found (empty when valid). */
export function validateSchema(root: Schema, value: unknown): SchemaError[] {
  const errors: SchemaError[] = [];
  const defs = typeof root === 'object' ? ((root.$defs as Record<string, Schema> | undefined) ?? {}) : {};
  const resolve = (ref: string): Schema => {
    const match = /^#\/\$defs\/([^/]+)$/.exec(ref);
    if (!match || !Object.hasOwn(defs, match[1])) throw new Error(`Unsupported or unknown $ref "${ref}"`);
    return defs[match[1]];
  };

  const check = (schema: Schema, data: unknown, path: string, out: SchemaError[]): void => {
    if (schema === true) return;
    if (schema === false) {
      out.push({ path, message: 'is not allowed' });
      return;
    }
    for (const key of Object.keys(schema)) if (!SUPPORTED.has(key)) throw new Error(`Unsupported JSON Schema keyword "${key}"`);
    const fail = (message: string) => out.push({ path: path || '/', message });

    if (typeof schema.$ref === 'string') check(resolve(schema.$ref), data, path, out);
    if (schema.type !== undefined) {
      const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
      if (!types.some(type => matchesType(data, type))) {
        fail(`must be ${types.join(' or ')} (got ${typeOf(data)})`);
        return;
      }
    }
    if (schema.const !== undefined && JSON.stringify(data) !== JSON.stringify(schema.const))
      fail(`must be ${JSON.stringify(schema.const)}`);
    if (Array.isArray(schema.enum) && !schema.enum.some(option => JSON.stringify(option) === JSON.stringify(data)))
      fail(`must be one of ${schema.enum.map(option => JSON.stringify(option)).join(', ')}`);
    if (Array.isArray(schema.anyOf)) {
      const branches = schema.anyOf.map(option => {
        const inner: SchemaError[] = [];
        check(option as Schema, data, path, inner);
        return inner;
      });
      if (!branches.some(inner => inner.length === 0)) {
        // Report the closest branch (fewest problems) so the message points at the real issue.
        const closest = branches.sort((a, b) => a.length - b.length)[0];
        out.push(...closest);
      }
    }

    if (typeof data === 'string') {
      if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(data)) fail(`must match ${schema.pattern}`);
      if (typeof schema.minLength === 'number' && [...data].length < schema.minLength)
        fail(schema.minLength === 1 ? 'must not be empty' : `must be at least ${schema.minLength} characters`);
      if (typeof schema.maxLength === 'number' && [...data].length > schema.maxLength)
        fail(`must be at most ${schema.maxLength} characters`);
      if (schema.format === 'uri' && !URL.canParse(data)) fail('must be a valid URL');
      if (schema.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(data)) fail('must be a YYYY-MM-DD date');
    }

    if (Array.isArray(data)) {
      if (typeof schema.minItems === 'number' && data.length < schema.minItems) fail(`must have at least ${schema.minItems} item(s)`);
      if (typeof schema.maxItems === 'number' && data.length > schema.maxItems) fail(`must have at most ${schema.maxItems} item(s)`);
      if (schema.uniqueItems === true && new Set(data.map(item => JSON.stringify(item))).size !== data.length)
        fail('must not repeat items');
      const prefix = Array.isArray(schema.prefixItems) ? (schema.prefixItems as Schema[]) : [];
      prefix.forEach((item, i) => {
        if (i < data.length) check(item, data[i], pointer(path, i), out);
      });
      if (schema.items !== undefined)
        for (let i = prefix.length; i < data.length; i += 1) check(schema.items as Schema, data[i], pointer(path, i), out);
    }

    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
      const record = data as Record<string, unknown>;
      const properties = (schema.properties ?? {}) as Record<string, Schema>;
      for (const key of (schema.required as string[] | undefined) ?? [])
        if (!Object.hasOwn(record, key) || record[key] === undefined) out.push({ path: pointer(path, key), message: 'is required' });
      for (const [key, item] of Object.entries(record)) {
        if (item === undefined) continue;
        if (schema.propertyNames !== undefined) check(schema.propertyNames as Schema, key, pointer(path, key), out);
        if (Object.hasOwn(properties, key)) check(properties[key], item, pointer(path, key), out);
        else if (schema.additionalProperties === false) out.push({ path: pointer(path, key), message: 'is not a known field' });
        else if (schema.additionalProperties !== undefined) check(schema.additionalProperties as Schema, item, pointer(path, key), out);
      }
    }
  };

  check(root, value, '', errors);
  return errors;
}

/** `path message` lines, for test output and CLI reports. */
export const formatErrors = (errors: SchemaError[]): string[] => errors.map(error => `${error.path || '/'} ${error.message}`);
