// A small structured-data checker for the tests: every node's @type must be a schema.org type we use, every property
// must exist on that type (or a supertype) per schema.org, URLs must be absolute, references must resolve, list
// positions must run 1..n, and Google's rules we rely on must hold (BreadcrumbList has two or more items, Person has a
// name, FAQ questions have answers). Review and rating markup is banned outright: the testimonials are placeholders.
// Property lists from https://schema.org/<Type> (read 2026-10-19).
type Node = Record<string, unknown>;

const THING = ['@id', '@type', 'name', 'url', 'description', 'image', 'sameAs', 'alternateName', 'mainEntityOfPage'];
const CREATIVE_WORK = [...THING, 'publisher', 'inLanguage', 'about', 'isPartOf', 'mainEntity', 'author', 'dateModified'];
const WEB_PAGE = [...CREATIVE_WORK, 'breadcrumb', 'primaryImageOfPage'];
const ORGANIZATION = [...THING, 'logo', 'legalName', 'address', 'contactPoint', 'email', 'telephone', 'foundingDate'];
const ITEM_LIST = [...THING, 'itemListElement', 'numberOfItems', 'itemListOrder'];

export const TYPES: Record<string, string[]> = {
  Organization: ORGANIZATION,
  SportsOrganization: [...ORGANIZATION, 'sport'],
  SportsTeam: [...ORGANIZATION, 'sport', 'athlete', 'coach', 'gender'],
  WebSite: CREATIVE_WORK,
  WebPage: WEB_PAGE,
  CollectionPage: WEB_PAGE,
  ProfilePage: WEB_PAGE,
  AboutPage: WEB_PAGE,
  ContactPage: WEB_PAGE,
  FAQPage: WEB_PAGE,
  ItemList: ITEM_LIST,
  BreadcrumbList: ITEM_LIST,
  ListItem: [...THING, 'item', 'position'],
  Person: [...THING, 'jobTitle', 'affiliation', 'knowsAbout', 'memberOf', 'award', 'nationality'],
  Question: [...THING, 'acceptedAnswer', 'suggestedAnswer', 'text'],
  Answer: [...THING, 'text'],
  Service: [...THING, 'serviceType', 'provider', 'brand', 'areaServed', 'audience', 'offers'],
  ImageObject: [...THING, 'contentUrl', 'width', 'height'],
};
const BANNED = /^(Review|AggregateRating|Rating|EmployerAggregateRating)$/;
const BANNED_PROPS = new Set(['review', 'reviews', 'aggregateRating', 'reviewRating']);
const URL_PROPS = new Set(['url', 'item', 'logo', 'image', 'sameAs', 'contentUrl']);
const absolute = (value: unknown) => typeof value === 'string' && /^https:\/\/[^/]/.test(value);

export function checkStructuredData(data: unknown, label: string): string[] {
  const problems: string[] = [];
  const doc = data as Node;
  if (doc['@context'] !== 'https://schema.org') problems.push(`${label}: @context must be https://schema.org`);
  const graph = (doc['@graph'] as Node[] | undefined) ?? [doc];
  const ids = new Set(graph.map(node => node['@id']).filter(Boolean));
  const refs: string[] = [];
  const visit = (node: Node, path: string) => {
    const type = node['@type'];
    const keys = Object.keys(node);
    if (type === undefined) {
      // A bare reference ({ "@id": … }).
      if (keys.length === 1 && keys[0] === '@id') refs.push(String(node['@id']));
      else problems.push(`${path}: node without @type`);
      return;
    }
    if (typeof type !== 'string' || BANNED.test(type)) problems.push(`${path}: banned or invalid @type ${String(type)}`);
    const allowed = TYPES[String(type)];
    if (!allowed) problems.push(`${path}: unknown @type ${String(type)}`);
    for (const key of keys) {
      if (key === '@context') continue;
      if (BANNED_PROPS.has(key)) problems.push(`${path}: banned property ${key}`);
      if (allowed && !allowed.includes(key)) problems.push(`${path}: ${String(type)} has no property "${key}"`);
      const value = node[key];
      if (URL_PROPS.has(key)) {
        const values = Array.isArray(value) ? value : [value];
        for (const item of values)
          if (typeof item === 'string' && !absolute(item)) problems.push(`${path}.${key}: "${item}" is not an absolute https URL`);
      }
      if (key === '@id' && !absolute(value)) problems.push(`${path}.@id: "${String(value)}" is not an absolute https URL`);
      const children = Array.isArray(value) ? value : [value];
      children.forEach((child, i) => {
        if (child && typeof child === 'object') visit(child as Node, `${path}.${key}${Array.isArray(value) ? `[${i}]` : ''}`);
      });
    }
    if (type === 'BreadcrumbList' || type === 'ItemList') {
      const items = (node.itemListElement as Node[] | undefined) ?? [];
      if (type === 'BreadcrumbList' && items.length < 2) problems.push(`${path}: a BreadcrumbList needs at least two items`);
      items.forEach((item, i) => {
        if (item.position !== i + 1) problems.push(`${path}: item ${i} has position ${String(item.position)}, expected ${i + 1}`);
        if (type === 'BreadcrumbList' && (!item.name || !absolute(item.item)))
          problems.push(`${path}: crumb ${i} needs a name and an absolute item`);
      });
      if (node.numberOfItems !== undefined && node.numberOfItems !== items.length) problems.push(`${path}: numberOfItems is wrong`);
    }
    if (type === 'Person' && !node.name) problems.push(`${path}: Person needs a name`);
    if (type === 'FAQPage') {
      const questions = (node.mainEntity as Node[] | undefined) ?? [];
      if (!questions.length) problems.push(`${path}: FAQPage without questions`);
      for (const q of questions)
        if (q['@type'] !== 'Question' || !q.name || !(q.acceptedAnswer as Node | undefined)?.text)
          problems.push(`${path}: incomplete Question`);
    }
  };
  graph.forEach((node, i) => {
    visit(node, `${label}[${i}]`);
  });
  for (const ref of refs) if (!ids.has(ref)) problems.push(`${label}: reference ${ref} is not in the graph`);
  return problems;
}

/** Every node of a graph, depth first. */
export function nodes(data: unknown): Node[] {
  const out: Node[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      out.push(value as Node);
      Object.values(value).forEach(walk);
    }
  };
  walk(data);
  return out;
}
