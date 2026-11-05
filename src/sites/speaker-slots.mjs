// site.json `home.fromSpeakers`: the hero, inset, carousel, about photo and role tile photos are taken from the live
// speakers (synced from Airtable on the Spurs site), featured first, so a speaker who isn't listed never appears
// anywhere. The configured slots only set how many carousel slides there are; without live speakers they stay as set.
// Shared by lib/content/publish.ts and the site tools' loader (src/sites/index.mjs), so both publish the same way.

/** Live speakers, featured first (in the featured order), then everyone else in roster order. */
export function speakerOrder(site) {
  const bySlug = new Map(site.people.map(person => [person.slug, person]));
  const featured = site.featured.map(slug => bySlug.get(slug)).filter(Boolean);
  return [...featured, ...site.people.filter(person => !site.featured.includes(person.slug))];
}

/** @param {{ home: object, roles: object[], people: object[], featured: string[] }} site a published site (hidden people removed) */
export function speakerSlots(site) {
  if (!site.home?.fromSpeakers) return site;
  const order = speakerOrder(site);
  if (!order.length) return site;
  const slot = person => ({ image: person.hero, name: person.name, line: person.short || person.pos });
  const [first, second = first, ...rest] = order;
  const slides = site.home.slides ? rest.slice(0, Math.max(site.home.slides.length, 1)).map(slot) : undefined;
  return {
    ...site,
    home: {
      ...site.home,
      hero: slot(first),
      inset: slot(second),
      ...(slides ? { slides } : {}),
      ...(site.home.aboutImage !== undefined ? { aboutImage: (order[slides ? slides.length + 2 : 2] ?? first).card } : {}),
    },
    roles: site.roles.map(role => {
      const person = order.find(candidate => candidate.role === role.key);
      return person ? { ...role, image: person.card } : role;
    }),
  };
}
