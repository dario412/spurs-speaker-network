// A tiny schema builder: the single source of the content contract. Each node knows its TypeScript type (Infer<>) and
// emits standard JSON Schema (draft 2020-12, see emit.ts). schemas.ts describes every provider shape with it and asserts
// at compile time that the inferred types equal the hand-written ones in lib/content/types.ts, so the TypeScript types,
// the JSON Schema files in schema/ and docs/content-contract.md cannot drift apart (`npm run schema -- --check` in CI).
// Constraints (pattern, minItems, …) refine the JSON Schema only; they never change the inferred type.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface Meta {
  description?: string;
  default?: Json;
  /** Shown in docs/content-contract.md next to the type, e.g. "slug" or "https URL". */
  label?: string;
}

export type Spec =
  | { kind: 'string'; pattern?: string; minLength?: number; maxLength?: number; format?: 'uri' | 'date' }
  | { kind: 'boolean' }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'null' }
  | { kind: 'array'; items: AnyNode; minItems?: number; maxItems?: number; uniqueItems?: boolean }
  | { kind: 'tuple'; items: readonly AnyNode[] }
  | { kind: 'object'; shape: Record<string, AnyNode | AnyOptional> }
  | { kind: 'record'; values: AnyNode; keyPattern?: string }
  | { kind: 'union'; options: readonly AnyNode[] }
  | { kind: 'ref'; name: string; target: AnyNode }
  | { kind: 'opaque'; json: Record<string, Json> };

export interface Node<T> {
  readonly spec: Spec;
  readonly meta: Meta;
  /** Phantom: carries the TypeScript type. Never set at runtime. */
  readonly __type?: T;
  describe(description: string): Node<T>;
  defaults(value: Json): Node<T>;
  label(label: string): Node<T>;
}

export interface Optional<T> {
  readonly optional: true;
  readonly node: Node<T>;
}

// biome-ignore lint/suspicious/noExplicitAny: the erased node type every builder accepts
export type AnyNode = Node<any>;
// biome-ignore lint/suspicious/noExplicitAny: the erased optional wrapper
export type AnyOptional = Optional<any>;

export type Infer<N> = N extends Optional<infer T> ? T : N extends Node<infer T> ? T : never;

type Flatten<T> = { [K in keyof T]: T[K] } & {};
type RequiredKeys<S> = { [K in keyof S]: S[K] extends AnyOptional ? never : K }[keyof S];
type OptionalKeys<S> = { [K in keyof S]: S[K] extends AnyOptional ? K : never }[keyof S];
export type InferShape<S> = Flatten<{ [K in RequiredKeys<S>]: Infer<S[K]> } & { [K in OptionalKeys<S>]?: Infer<S[K]> }>;

const node = <T>(spec: Spec, meta: Meta = {}): Node<T> => ({
  spec,
  meta,
  describe: description => node<T>(spec, { ...meta, description }),
  defaults: value => node<T>(spec, { ...meta, default: value }),
  label: label => node<T>(spec, { ...meta, label }),
});

export const s = {
  string: (constraints: Omit<Extract<Spec, { kind: 'string' }>, 'kind'> = {}) => node<string>({ kind: 'string', ...constraints }),
  boolean: () => node<boolean>({ kind: 'boolean' }),
  enum: <const V extends readonly string[]>(values: V) => node<V[number]>({ kind: 'enum', values }),
  literal: <const V extends string>(value: V) => node<V>({ kind: 'enum', values: [value] }),
  array: <T>(items: Node<T>, constraints: { minItems?: number; maxItems?: number; uniqueItems?: boolean } = {}) =>
    node<T[]>({ kind: 'array', items, ...constraints }),
  tuple: <const N extends readonly AnyNode[]>(items: N) => node<{ -readonly [K in keyof N]: Infer<N[K]> }>({ kind: 'tuple', items }),
  object: <S extends Record<string, AnyNode | AnyOptional>>(shape: S) => node<InferShape<S>>({ kind: 'object', shape }),
  /** Every key optional (TypeScript `Partial<>`). */
  partial: <S extends Record<string, AnyNode | AnyOptional>>(shape: S) =>
    node<Partial<InferShape<S>>>({
      kind: 'object',
      shape: Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, 'optional' in value ? value : s.optional(value)])),
    }),
  record: <T>(values: Node<T>, keyPattern?: string) => node<Record<string, T>>({ kind: 'record', values, keyPattern }),
  nullable: <T>(inner: Node<T>) => node<T | null>({ kind: 'union', options: [inner, node<null>({ kind: 'null' })] }, inner.meta),
  union: <const N extends readonly AnyNode[]>(options: N) => node<Infer<N[number]>>({ kind: 'union', options }),
  optional: <T>(inner: Node<T>): Optional<T> => ({ optional: true, node: inner }),
  /** A named definition: emitted once under $defs and documented as its own table. */
  ref: <T>(name: string, target: Node<T>) => node<T>({ kind: 'ref', name, target }),
  /** Typed as T in TypeScript (e.g. `unknown` bookkeeping) but described by the given JSON Schema. */
  opaque: <T>(json: Record<string, Json>) => node<T>({ kind: 'opaque', json }),
};

/**
 * Deep structural normalisation, so interfaces, intersections and `Partial<Record<…>>` compare equal to the flattened
 * object types the builder infers. Arrays and tuples keep their shape.
 */
type Normalize<T> = T extends readonly unknown[]
  ? { [K in keyof T]: Normalize<T[K]> }
  : T extends object
    ? { [K in keyof T]: Normalize<T[K]> }
    : T;

/** True only when A and B are the same type (optional vs required, extra keys and nullability all count). */
export type Same<A, B> =
  (<X>() => X extends Normalize<A> ? 1 : 2) extends <X>() => X extends Normalize<B> ? 1 : 2 ? true : { mismatch: [A, B] };

/** Compile-time assertion: `const _: Assert<Same<A, B>> = true` fails to typecheck when the types drift. */
export type Assert<T extends true> = T;
