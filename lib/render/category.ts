// Category pages: one page per role (/<slug>/category/<role-slug>), so each kind of speaker has its own crawlable URL
// instead of a ?role= filter on the roster. The slug comes from the role's label ("Managers & head coaches" ->
// "managers-head-coaches"); a role nobody holds has no page.
import type { Person, Role, Site } from '../content/types.ts';

/** URL segment for a role: its label in lower case, runs of other characters as single hyphens. */
export const roleSlug = (role: Pick<Role, 'label'>): string =>
  role.label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&[a-z]+;/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** People holding a role, in roster order. */
export const peopleIn = (site: Pick<Site, 'people'>, role: Pick<Role, 'key'>): Person[] =>
  site.people.filter(person => person.role === role.key);

/** Roles that get a category page: those at least one published person holds. */
export const categoryRoles = (site: Pick<Site, 'roles' | 'people'>): Role[] => site.roles.filter(role => peopleIn(site, role).length > 0);

/** The role a category slug names, or undefined. */
export const roleForSlug = (site: Pick<Site, 'roles' | 'people'>, slug: string): Role | undefined =>
  categoryRoles(site).find(role => roleSlug(role) === slug);

/** The most common items in a list of lists (talk topics across a category), most frequent first, ties in first-seen order. */
export function topItems(lists: string[][], limit: number): { item: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const list of lists) for (const item of list) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()]
    .map(([item, count]) => ({ item, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
