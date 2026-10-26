// Builds new site content: a branded shell with placeholder people, or a populated site from research output.
// Shared by `npm run new-site`, `npm run assemble-site` and the admin's "New site" form. Nothing here touches disk.

const PLACEHOLDER_ROLES = [
  ['player', 'Former player', 'past'],
  ['player', 'Former player', 'past'],
  ['manager', 'Former manager', 'past'],
  ['staff', 'Coach', 'past'],
  ['women', 'Women’s game', 'past'],
  ['squad', 'Current player', 'today'],
];

const PLACEHOLDER_TEXT = 'Placeholder profile. Replace with a real person using the populated workflow.';

const originOf = url => (url && URL.canParse(url) ? new URL(url).origin : null);

/**
 * A shell site: real name, colours and marks; placeholder people and "Photo to come" images.
 * @param {{ slug: string, name: string, short?: string, brand?: string, ink?: string, dark?: string, bar?: string,
 *   wordmark?: string|null, crest?: string|null, brief?: object }} options `brief` is a research-brief `club` object
 *   whose fields fill anything not given explicitly.
 */
export function shellSite({ slug, name, short, brand, ink, dark, bar, wordmark, crest, brief = {} }) {
  const shortName = short ?? brief.short ?? name;
  const brandColour = brand ?? brief.theme?.brand ?? '#000a3c';
  const inkColour = ink ?? brief.theme?.ink ?? '#11111f';
  const wordmarkUrl = wordmark ?? brief.marks?.wordmark ?? null;
  const crestUrl = crest ?? brief.marks?.crest ?? null;
  const platform = brief.platform ?? `${shortName} Speaker Network`;

  const people = PLACEHOLDER_ROLES.map(([role, label, era], i) => ({
    slug: `placeholder-${i + 1}`,
    name: `${label} ${i + 1}`,
    first: label,
    role,
    roleLabel: label,
    era,
    limited: role === 'squad',
    hero: null,
    gallery: [null, null, null],
    card: null,
    pos: `${label} · ${shortName}`,
    short: `${label} · ${shortName}`,
    honour: 'Placeholder profile',
    line: PLACEHOLDER_TEXT,
    stats: [
      ['—', 'Years'],
      ['—', 'Position'],
      ['—', 'Honours'],
      ['—', 'Today'],
    ],
    bio: [PLACEHOLDER_TEXT],
    why: 'Placeholder.',
    timeline: [['—', 'Placeholder']],
    talks: ['Leadership', 'Teamwork', 'Resilience'],
    audiences: ['Conferences', 'Client hospitality'],
    industries: ['All sectors'],
    formats: ['keynote', 'hospitality', 'brand'],
    langs: 'English',
  }));

  const site = {
    slug,
    status: 'shell',
    short: shortName,
    orgName: name,
    platform,
    platformShort: brief.platformShort ?? 'Speaker Network',
    tagline: brief.tagline ?? `The official ${name} speaker network`,
    entity: brief.entity ?? `${platform} is the official ${name} speaker booking service, operated by PepTalk.`,
    motto: brief.motto ?? null,
    copyright: brief.copyright ?? `${name}.`,
    heroTitle: brief.heroTitle ?? ['Welcome to the official', `${shortName} speaker network.`],
    waysTitle: brief.waysTitle ?? 'Ways to book',
    stadium: brief.stadium ?? `the ${shortName} venue`,
    marks: { crest: crestUrl, wordmark: wordmarkUrl },
    navMark: wordmarkUrl ? 'wordmark' : 'crest',
    crestOnLight: true,
    ...(crestUrl ? {} : { crestFallback: shortName.slice(0, 3).toUpperCase() }),
    theme: {
      brand: brandColour,
      ink: inkColour,
      dark: dark ?? brief.theme?.dark ?? inkColour,
      bar: bar ?? brief.theme?.bar ?? inkColour,
      display: brief.theme?.display ?? "'Barlow Condensed','Outfit',helvetica,sans-serif",
    },
    cspHosts: [...new Set([wordmarkUrl, crestUrl].map(originOf).filter(Boolean))],
    featured: people.map(person => person.slug),
    home: {
      hero: { image: null, name: 'Featured speaker', line: 'Placeholder' },
      inset: { image: null, name: 'Featured speaker', line: 'Placeholder' },
      eraImage: null,
      storyImage: null,
      hospitalityImage: null,
      activeEra: 'past',
    },
    vocab: brief.vocab ?? {},
    roles: [
      { key: 'player', label: 'Former players', blurb: 'Former players from every era.', image: null, singular: 'Former player' },
      { key: 'manager', label: 'Managers & coaches', blurb: 'Leadership under pressure.', image: null, singular: 'Former manager' },
      { key: 'staff', label: 'Staff', blurb: 'The people behind the results.', image: null, singular: 'Coach' },
      { key: 'women', label: 'Women’s game', blurb: 'Pioneers and current stars.', image: null, singular: 'Women’s game' },
      { key: 'squad', label: 'Current squad', blurb: 'Today’s players, subject to the calendar.', image: null, singular: 'Current player' },
    ],
    eras: [
      { key: 'past', label: 'Past', blurb: 'Former players and staff' },
      { key: 'today', label: 'Today', blurb: 'The current squad' },
    ],
  };
  return { ...site, people, images: {} };
}

// Research agents sometimes leave inline notes; they belong in the PR description, never on the page.
const NOTE = /\s*\((?:verify|TBC)[^)]*\)/gi;
const stripNotes = value => {
  if (typeof value === 'string') return value.replace(NOTE, '').trim();
  if (Array.isArray(value)) return value.map(stripNotes);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripNotes(v)]));
  return value;
};

/**
 * A populated site from research output (docs/research-brief.md).
 * @param {{ slug: string, config: { club: object, roles: object[], eras: object[], legends?: object[],
 *   images?: object }, peopleFiles?: { legends?: object[], images?: object }[], eraMap?: Record<string, string> }} input
 */
export function assembleSite({ slug, config, peopleFiles = [], eraMap = {} }) {
  const images = Object.assign({}, config.images, ...peopleFiles.map(file => file.images));
  const people = [...peopleFiles.flatMap(file => file.legends ?? []), ...(config.legends ?? [])].map(person =>
    stripNotes({ ...person, era: eraMap[person.era] ?? person.era }),
  );
  // Stories were removed from the product; research configs that still carry them are ignored (assemble-site says so).
  const { roles = [], eras = [] } = config;
  // Keys starting with "_" are research notes for reviewers (sources, caveats); they never reach the site.
  const club = Object.fromEntries(Object.entries(config.club ?? {}).filter(([key]) => !key.startsWith('_') && key !== 'status'));
  const site = { ...club, slug, roles, eras };

  // Keep only the images the site actually uses.
  const used = new Set();
  for (const person of people) for (const id of [person.hero, person.card, ...(person.gallery ?? [])]) used.add(id);
  for (const key of ['hero', 'inset']) used.add(site.home?.[key]?.image);
  for (const key of ['eraImage', 'storyImage', 'hospitalityImage']) used.add(site.home?.[key]);
  for (const role of roles) used.add(role.image);
  const siteImages = Object.fromEntries(
    [...used]
      .filter(id => id && images[id])
      .sort()
      .map(id => [id, typeof images[id] === 'string' ? images[id] : images[id].url]),
  );
  return { ...site, people, images: siteImages };
}
