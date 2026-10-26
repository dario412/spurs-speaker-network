// Titles and meta descriptions for every page type: one definition, used by generateMetadata, the JSON-LD page node
// and the tests. Titles are unique per page and kept to TITLE_MAX characters by trying progressively shorter forms;
// descriptions are unique per page and clamped to DESCRIPTION_MAX at a word boundary. Google sets no hard limit on
// either but truncates to the device width (https://developers.google.com/search/docs/appearance/title-link,
// https://developers.google.com/search/docs/appearance/snippet), so these are display budgets, not rules.
import type { LegalDoc, Person } from '../content/types.ts';
import type { SiteContext } from '../render/context.ts';

export const TITLE_MAX = 65;
export const DESCRIPTION_MIN = 50;
export const DESCRIPTION_MAX = 160;

export interface PageCopy {
  title: string;
  description: string;
}

/** The first candidate that fits the title budget (else the last, shortest one). */
export const fitTitle = (candidates: string[], max = TITLE_MAX): string =>
  candidates.find(candidate => candidate.length <= max) ?? candidates[candidates.length - 1];

/** Clamps to `max` characters at a word boundary, ending with an ellipsis when cut. Collapses whitespace. */
export function clampDescription(text: string, max = DESCRIPTION_MAX): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:·–-]+$/, '')}…`;
}

/** "a, b and c" */
export const listText = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

export function homeCopy({ site, v }: SiteContext): PageCopy {
  return {
    title: fitTitle([
      `${site.platform} | Book ${site.orgName} ${v.legendsNoun} and current ${v.peopleNoun}`,
      `${site.platform} | Book ${site.orgName} ${v.legendsNoun}`,
      `${site.platform} | Official ${site.short} ${v.legendsNoun}`,
      site.platform,
    ]),
    description: clampDescription(site.entity),
  };
}

export function legendsCopy({ site, v, hasSquad }: SiteContext): PageCopy {
  const who = hasSquad ? `${v.legendsNoun} and current ${v.peopleNoun}` : v.legendsNoun;
  return {
    title: fitTitle([`All ${site.short} ${v.legendsNoun} to book | ${site.platform}`, `${site.short} ${v.legendsNoun} | ${site.platform}`]),
    description: clampDescription(
      `Browse ${site.people.length} ${site.orgName} ${who} available for keynotes, hospitality and events. Filter by role, era or topic.`,
    ),
  };
}

export function profileCopy({ site, v }: SiteContext, person: Person): PageCopy {
  const official = v.officialLegendLabel ?? `Official ${site.orgName} ${v.legendNoun}`;
  return {
    title: fitTitle([
      `Book ${person.name} | ${official} | ${site.platform}`,
      `Book ${person.name} | ${site.platform}`,
      `Book ${person.name} | ${site.platformShort}`,
      `Book ${person.name}`,
    ]),
    description: clampDescription(`Book ${person.name} for keynotes, hospitality and events. ${person.line}`),
  };
}

export function waysCopy(ctx: SiteContext): PageCopy {
  const { site, v, FORMATS } = ctx;
  const lead = v.waysLead ?? `From a keynote to a full matchday, here is how you can work with ${site.short} ${v.legendsNoun}.`;
  const titles = Object.values(FORMATS).map(format => lower(format.title));
  return {
    title: fitTitle([`Ways to book ${site.short} ${v.legendsNoun} | ${site.platform}`, `Ways to book | ${site.platform}`]),
    description: clampDescription(`${lead} ${titles.length} formats: ${listText(titles)}.`),
  };
}

export function hospitalityCopy({ site, v }: SiteContext): PageCopy {
  const lead = v.hospitalityLead ?? `Add a ${site.short} ${v.legendNoun} to your lounge or box at ${site.stadium}.`;
  return {
    title: fitTitle([
      `${v.hospitalityTitle} with ${site.short} ${v.legendsNoun} | ${site.platform}`,
      `${v.hospitalityTitle} | ${site.platform}`,
      v.hospitalityTitle,
    ]),
    description: clampDescription(`${lead} ${v.hospitalityBody}`),
  };
}

export function aboutCopy({ site, v }: SiteContext): PageCopy {
  const title = v.aboutTitle.includes(site.platform)
    ? fitTitle([`${v.aboutTitle} and booking FAQs`, v.aboutTitle])
    : fitTitle([`${v.aboutTitle} | ${site.platform}`, v.aboutTitle]);
  return {
    title,
    description: clampDescription(
      `Who runs ${site.platform}, and answers to common questions about booking ${site.orgName} ${v.legendsNoun}: fees, lead times, travel and contracts.`,
    ),
  };
}

export function checkAvailabilityCopy({ site, v }: SiteContext): PageCopy {
  return {
    title: fitTitle([`Check availability of ${site.short} ${v.legendsNoun} | ${site.platform}`, `Check availability | ${site.platform}`]),
    description: clampDescription(
      `Check availability for ${site.orgName} ${v.legendsNoun}. Tell us about your event and the PepTalk bookings team replies within one working day.`,
    ),
  };
}

export function legalCopy({ site }: SiteContext, doc: LegalDoc): PageCopy {
  return {
    title: fitTitle([`${doc.title} | ${site.platform}`, doc.title]),
    description: clampDescription(`${doc.title} for ${site.platform}, the official ${site.orgName} booking platform operated by PepTalk.`),
  };
}
