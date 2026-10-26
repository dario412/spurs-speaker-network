// Fictional partner sites for the tests. The repository ships one real site (spurs), but much of what the tests prove
// needs more than one: one site's password never opens another's pages, a launched (indexable) site next to gated ones,
// a site on a live domain, an old slug that redirects, a site with tracking, an en-US site. These sites stand in for
// the partners that used to live in src/sites/. Everything here is invented: the organisations, the people and their
// careers (northbridge starts from schema/examples/site-populated.json). Image URLs point at media.example.com and
// placeholder Getty ids; nothing fetches them.
//
// writeSitesDir() writes a content directory (what APPEARANCES_SITES_DIR or createJsonProvider({ sitesDir }) read): a
// copy of every real site in src/sites/, the fictional sites, and a registry listing them all with no root site (the
// landing page at /) and one old slug redirect. Files are in the canonical format (src/sites/store.mjs).
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatJson, siteFiles } from '../../src/sites/store.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SITES = join(ROOT, 'src', 'sites');
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

/** The fictional sites' slugs, in registry order (after the real sites). */
export const FICTIONAL = ['northbridge', 'eastvale'];
/** An old slug that 301s to a fictional site (registry.redirects). */
export const OLD_SLUG = 'north-bridge';

const photos = (site, slug) => {
  const id = name => `media.example.com/people/${site}/${slug}-${name}.jpg`;
  return { hero: id('hero'), card: id('card'), gallery: [id('gallery-1'), id('gallery-2'), id('gallery-3')] };
};

/**
 * One invented person with every field the validator needs; the copy is built from the few facts given.
 * @param {string} site
 * @param {string} org the organisation's display name
 * @param {{ slug: string, name: string, role: string, roleLabel: string, era: string, position: string, start: string,
 *   end?: string, country: string, honour: string, talks: string[], formats: string[], limited?: boolean }} facts
 */
function person(site, org, { slug, name, role, roleLabel, era, position, start, end, country, honour, talks, formats, limited = false }) {
  const first = name.split(' ')[0];
  const years = `${start}–${end ?? ''}`;
  const span = end ? `${start} to ${end}` : `${start} to today`;
  return {
    slug,
    name,
    first,
    role,
    roleLabel,
    era,
    limited,
    ...photos(site, slug),
    pos: `${position} · ${org} ${years} · ${country}`,
    short: `${position} · ${years} · ${country}`,
    honour,
    line: `${name}, ${position.toLowerCase()} at ${org} from ${span}, talks about ${talks[0].toLowerCase()} with warmth and plain honesty.`,
    stats: [
      [years, 'Club years'],
      [position, 'Position'],
      [country, 'Nationality'],
      end ? ['Speaker', 'Today'] : ['Current', 'Squad'],
    ],
    bio: [
      `${name} joined ${org} in ${start} and became a ${position.toLowerCase()} the supporters trusted.`,
      `Today ${first} works with teams and audiences on ${talks.map(talk => talk.toLowerCase()).join(', ')}.`,
    ],
    why: `Best for events that want ${first}'s take on ${talks[1].toLowerCase()}, told with stories from the dressing room.`,
    timeline: [
      [start, `Joins ${org}`],
      [end ?? 'Today', end ? `Final season at ${org}` : `Still part of the ${org} squad`],
    ],
    talks,
    audiences: ['Leadership teams', 'Client hospitality', 'Sales kick-offs'],
    industries: ['Finance', 'Technology', 'Retail'],
    formats,
    langs: 'English',
  };
}

const imagesOf = people =>
  Object.fromEntries(
    people.flatMap(p => [p.hero, p.card, ...p.gallery]).map(id => [id, `https://${id}`]),
  );

/**
 * Northbridge City FC: the populated example site (schema/examples) with four more invented people, without its
 * tracking, consent, licence approvals or verification checks (tests that need them add them).
 */
export function northbridge() {
  const { tracking: _, consent: __, licences: ___, verification: ____, orgType: _____, ...example } = readJson(
    join(ROOT, 'schema', 'examples', 'site-populated.json'),
  );
  const org = 'Northbridge City';
  const more = [
    { slug: 'dan-whitlow', name: 'Dan Whitlow', role: 'player', roleLabel: 'Ex-player', era: 'modern', position: 'Striker' },
    { slug: 'maya-penrose', name: 'Maya Penrose', role: 'women', roleLabel: 'City Women', era: 'modern', position: 'Goalkeeper' },
    { slug: 'lewis-carrick', name: 'Lewis Carrick', role: 'manager', roleLabel: 'Manager', era: 'nineties', position: 'Manager' },
    { slug: 'kit-barlow', name: 'Kit Barlow', role: 'player', roleLabel: 'Ex-player', era: 'nineties', position: 'Winger' },
  ].map((facts, i) =>
    person('northbridge', org, {
      ...facts,
      start: String(1993 + i * 6),
      end: String(2000 + i * 6),
      country: ['England', 'Scotland', 'Wales', 'Northern Ireland'][i],
      honour: ['Top scorer in the promotion season', 'Player of the season twice', 'Took the club up from the third tier', 'Ever-present for four seasons'][i],
      talks: [
        ['Performing under pressure', 'Confidence', 'Teamwork'],
        ['Resilience', 'Decision-making', 'Women in sport'],
        ['Leadership', 'Building a team', 'Managing change'],
        ['Wellbeing', 'Staying motivated', 'Teamwork'],
      ][i],
      formats: [['keynote', 'hospitality', 'fan'], ['keynote', 'clinic', 'virtual'], ['keynote', 'workshop', 'hospitality'], ['fan', 'brand', 'hospitality']][i],
    }),
  );
  return { ...example, people: [...example.people, ...more], images: { ...example.images, ...imagesOf(more) } };
}

/** Eastvale Rovers: an invented en-US club with eight invented people, no marks (a text crest) and every page on. */
export function eastvale() {
  const org = 'Eastvale Rovers';
  const facts = [
    ['casey-holt', 'Casey Holt', 'player', 'Former player', 'founding', 'Midfielder', '1998', '2009', 'USA', 'Club captain for five seasons'],
    ['marco-delane', 'Marco Delane', 'player', 'Former player', 'cup-years', 'Forward', '2006', '2014', 'Canada', 'Record scorer of the cup years'],
    ['ruth-ambler', 'Ruth Ambler', 'manager', 'Former head coach', 'cup-years', 'Head coach', '2008', '2016', 'USA', 'Two cup titles as head coach'],
    ['owen-pask', 'Owen Pask', 'staff', 'Coach', 'founding', 'Goalkeeping coach', '2001', '2019', 'Ireland', 'Eighteen seasons on the staff'],
    ['lena-voss', 'Lena Voss', 'women', 'Rovers Women', 'cup-years', 'Defender', '2010', '2018', 'Germany', "First captain of the women's team"],
    ['jordan-feely', 'Jordan Feely', 'player', 'Former player', 'founding', 'Goalkeeper', '1999', '2011', 'USA', 'Three seasons without missing a game'],
    ['sam-okoro', 'Sam Okoro', 'squad', 'Current player', 'today', 'Winger', '2023', undefined, 'Nigeria', 'Breakthrough player of the season'],
    ['ivy-castell', 'Ivy Castell', 'women', 'Rovers Women', 'today', 'Midfielder', '2019', undefined, 'USA', 'Captain of the women’s team'],
  ];
  const talks = [
    ['Leadership', 'Team culture', 'Resilience'],
    ['Performing under pressure', 'Confidence', 'Goal setting'],
    ['Building a team', 'Leadership', 'Managing change'],
    ['Preparation', 'Coaching', 'Attention to detail'],
    ['Women in sport', 'Leadership', 'Resilience'],
    ['Consistency', 'Staying motivated', 'Wellbeing'],
    ['Ambition', 'Starting out', 'Teamwork'],
    ['Captaincy', 'Communication', 'Team culture'],
  ];
  const formats = [
    ['keynote', 'hospitality', 'brand', 'virtual'],
    ['keynote', 'fan', 'hospitality'],
    ['keynote', 'workshop', 'virtual'],
    ['clinic', 'workshop', 'keynote'],
    ['keynote', 'clinic', 'brand'],
    ['fan', 'hospitality', 'clinic'],
    ['brand', 'fan', 'hospitality'],
    ['keynote', 'brand', 'fan'],
  ];
  const people = facts.map(([slug, name, role, roleLabel, era, position, start, end, country, honour], i) =>
    person('eastvale', org, {
      slug,
      name,
      role,
      roleLabel,
      era,
      position,
      start,
      end,
      country,
      honour,
      talks: talks[i],
      formats: formats[i],
      limited: role === 'squad',
    }),
  );
  const getty = id => `https://media.gettyimages.com/id/${id}/photo/example-eastvale-${id}.jpg?s=612x612&w=0&k=20&c=example`;
  return {
    slug: 'eastvale',
    lang: 'en-US',
    short: 'Eastvale',
    orgName: org,
    platform: 'Eastvale Rovers Legends',
    platformShort: 'Rovers Legends',
    tagline: 'Official Eastvale Rovers speaker and appearance bookings',
    entity: 'Eastvale Rovers Legends is the official Eastvale Rovers speaker booking service, operated by PepTalk.',
    motto: null,
    copyright: 'Eastvale Rovers Soccer Club',
    heroTitle: ['Book an Eastvale', 'Rovers legend'],
    waysTitle: 'Ways to book',
    stadium: 'Eastvale Field',
    marks: { crest: null, wordmark: null },
    navMark: 'crest',
    crestFallback: 'ERSC',
    theme: { brand: '#15803d', ink: '#052e16', dark: '#022c22', bar: '#166534', display: 'Outfit, helvetica, sans-serif' },
    cspHosts: [],
    featured: ['casey-holt', 'ruth-ambler', 'lena-voss', 'sam-okoro'],
    home: {
      hero: { image: people[0].hero, name: 'Casey Holt', line: 'Midfielder · 1998–2009' },
      inset: { image: people[2].card, name: 'Ruth Ambler', line: 'Head coach · 2008–2016' },
      eraImage: '1000000003',
      storyImage: '1000000004',
      hospitalityImage: '1000000003',
      activeEra: 'cup-years',
    },
    vocab: {},
    roles: [
      { key: 'player', label: 'Former players', blurb: 'Captains, scorers and fan favorites', image: '1000000004', singular: 'Former player' },
      { key: 'manager', label: 'Head coaches', blurb: 'The coaches who built the teams', singular: 'Former head coach' },
      { key: 'staff', label: 'Coaching staff', blurb: 'The people behind the results', singular: 'Coach' },
      { key: 'women', label: 'Rovers Women', blurb: 'Stars of the women’s team', singular: 'Rovers Women player' },
      { key: 'squad', label: 'Current squad', blurb: 'Today’s players, subject to the schedule', singular: 'Current player' },
    ],
    eras: [
      { key: 'founding', label: 'The founding years', blurb: 'The first squads' },
      { key: 'cup-years', label: 'The cup years', blurb: 'Two titles in three seasons' },
      { key: 'today', label: 'Today', blurb: 'The current squad' },
    ],
    people,
    images: { 1000000003: getty('1000000003'), 1000000004: getty('1000000004'), ...imagesOf(people) },
  };
}

/** Every fictional site, in registry order. */
export const fictionalSites = () => [northbridge(), eastvale()];

/** Writes one site (with people and images) into a content directory, in the canonical format. */
export function writeSite(dir, site) {
  for (const [path, text] of Object.entries(siteFiles(site))) {
    const target = join(dir, path.slice('src/sites/'.length));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
}

/** Writes registry.json into a content directory, in the canonical format. */
export const writeRegistry = (dir, registry) => writeFileSync(join(dir, 'registry.json'), formatJson(registry));

const created = [];
process.on('exit', () => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

/**
 * A content directory: every real site from src/sites/ (copied as stored), the fictional sites, and a registry with all
 * of them in order, no root site and `north-bridge` → `northbridge`. Returns the directory's path.
 * @param {{ dir?: string, sites?: object[], registry?: object }} [options] `dir` to fill an existing directory (the
 *   caller removes it); `sites` replaces the fictional sites; `registry` is merged over the default registry.
 */
export function writeSitesDir({ dir, sites = fictionalSites(), registry = {} } = {}) {
  const target = dir ?? mkdtempSync(join(tmpdir(), 'appearances-sites-'));
  if (!dir) created.push(target);
  const real = readJson(join(SITES, 'registry.json')).order;
  for (const slug of real) cpSync(join(SITES, slug), join(target, slug), { recursive: true });
  for (const site of sites) writeSite(target, site);
  writeRegistry(target, {
    order: [...real, ...sites.map(site => site.slug)],
    redirects: sites.some(site => site.slug === 'northbridge') ? { [OLD_SLUG]: 'northbridge' } : {},
    ...registry,
  });
  return target;
}
