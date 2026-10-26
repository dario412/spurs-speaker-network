// Airtable people provider (PEOPLE_PROVIDER=airtable): each configured site's people and their R2 images come from
// one Airtable table, read by field ID, filtered to the site and the publishing gate, mapped and validated
// (airtable/mapper.ts). Sites not listed in the config's `sites.values` keep the content provider's people.
// Fails closed: an unreachable API, rejected credentials, too many invalid records, or a result that breaks the
// site's rules (a featured person missing, say) throws a ContentError. The build then fails, and under ISR the last
// good page keeps being served. Setup: docs/airtable-cms.md.

import { type AirtableLogEvent, createAirtableClient, jsonLog } from './airtable/client.ts';
import { type AirtableConfig, fieldIds } from './airtable/config.ts';
import { assertHealthy, describeSkipped, mapRecords, siteProblems } from './airtable/mapper.ts';
import { ContentError } from './errors.ts';
import type { PeopleProvider } from './provider.ts';

/** A string literal in an Airtable formula. */
const literal = (value: string): string => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
const ref = (id: string): string => `{${id}}`;

/**
 * The server-side filter: the site's records that pass the publishing gate. Field IDs work in formulas
 * (https://airtable.com/developers/web/api/list-records, filterByFormula). The mapper checks the same conditions
 * again on what comes back, so a loose formula can never publish a record the gate would refuse.
 */
export function filterFormula(config: AirtableConfig, site: string): string {
  const { field, values } = config.sites;
  const wanted = values[site];
  const siteMatch =
    field.type === 'list'
      ? `FIND(${literal(`,${wanted},`)}, "," & ARRAYJOIN(${ref(field.id)}, ",") & ",")`
      : `${ref(field.id)} = ${literal(wanted)}`;
  const parts = [siteMatch];
  const { status, consent, archived } = config.publish;
  if (status) parts.push(`OR(${status.values.map(value => `${ref(status.field.id)} = ${literal(value)}`).join(', ')})`);
  if (consent) parts.push(ref(consent.id));
  if (archived) parts.push(`NOT(${ref(archived.id)})`);
  return `AND(${parts.join(', ')})`;
}

export interface AirtableProviderOptions {
  token: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (event: AirtableLogEvent) => void;
}

export function createAirtablePeopleProvider(config: AirtableConfig, options: AirtableProviderOptions): PeopleProvider {
  const log = options.log ?? jsonLog;
  const client = createAirtableClient({ token: options.token, baseId: config.baseId, fetch: options.fetch, sleep: options.sleep, log });
  return {
    async peopleFor(site) {
      if (!Object.hasOwn(config.sites.values, site.slug)) return null;
      const records = await client.listRecords(config.tableId, {
        fields: fieldIds(config),
        filterByFormula: filterFormula(config, site.slug),
        view: config.view,
        maxPages: config.maxPages,
      });
      const result = mapRecords(records, config, site);
      for (const line of describeSkipped(result.errors)) log({ event: 'airtable.record_skipped', site: site.slug, detail: line });
      assertHealthy(result, config);
      const problems = siteProblems(site, result);
      if (problems.length)
        throw new ContentError('invalid_content', `Airtable people for ${site.slug} break the site's content rules`, {
          provider: 'airtable',
          details: problems,
        });
      log({
        event: 'airtable.synced',
        site: site.slug,
        records: records.length,
        people: result.people.length,
        skipped: result.errors.length,
        excluded: result.excluded.length,
      });
      return { people: result.people, images: result.images };
    },
  };
}
