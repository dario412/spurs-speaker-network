// `npm run contract`: the conformance suite against the providers the environment selects (CONTENT_PROVIDER,
// PEOPLE_PROVIDER and their settings), i.e. against a real CMS or Airtable base. Not part of `npm test`, which never
// touches the network. Examples:
//   CONTENT_PROVIDER=cms CMS_API_URL=… CMS_TOKEN=… npm run contract
//   PEOPLE_PROVIDER=airtable AIRTABLE_TOKEN=… AIRTABLE_CONFIG_FILE=config/airtable.json npm run contract
// Optional:
//   CONTRACT_FAILING_ENV='{"CMS_API_URL":"http://127.0.0.1:9"}'  env overrides that break the source, to check that
//                                                               failures surface as ContentError (errors check)
//   CONTRACT_FETCH_IMAGES=1                                     also fetch every image URL once (HEAD)
import { selectProvider } from '../../lib/content/select.ts';
import { providerConformance } from './provider-conformance.ts';

const failingEnv = process.env.CONTRACT_FAILING_ENV ? (JSON.parse(process.env.CONTRACT_FAILING_ENV) as Record<string, string>) : null;
const label = `CONTENT_PROVIDER=${process.env.CONTENT_PROVIDER || 'json'} PEOPLE_PROVIDER=${process.env.PEOPLE_PROVIDER || 'json'}`;

providerConformance(label, {
  provider: () => selectProvider(process.env, { json: { cache: false } }),
  ...(failingEnv ? { failing: () => selectProvider({ ...process.env, ...failingEnv }, { json: { cache: false } }) } : {}),
  ...(process.env.CONTRACT_FETCH_IMAGES === '1' ? { fetchImages: fetch } : {}),
});
