// Site packs in the admin: upload → review (with an in-memory preview) → import or discard, and per-site download.
// Upload and review never write; Import goes through the normal validated save path with the og cards alongside.
import { buildPack, PackError, packName, prepareImport, readPack } from '../../sites/packs.mjs';
import { HttpError } from '../http.mjs';
import { dashboard } from '../views/dashboard.mjs';
import { packReview } from '../views/packs.mjs';
import { afterPublish, afterSave, siteOr404 } from './common.mjs';

const uploadError = (ctx, snap, problems) => ({
  status: 422,
  title: 'Sites',
  crumbs: [],
  body: dashboard({ registry: snap.registry, sites: snap.sites, csrf: ctx.csrf, upload: { problems } }),
});

export function uploadPack(ctx) {
  const snap = ctx.content.snapshot();
  const file = ctx.files?.pack;
  if (!file?.data.length) return uploadError(ctx, snap, ['Choose a .site-pack.zip file to upload.']);
  try {
    const pack = readPack(file.data, { existing: snap.registry.order, redirects: snap.registry.redirects });
    const id = ctx.pending.add({ pack, filename: file.filename || packName(pack.site.slug) });
    return { redirect: `/packs/${id}` };
  } catch (error) {
    if (error instanceof PackError) return uploadError(ctx, snap, [error.message]);
    throw error;
  }
}

/** The pending pack named in the URL, or a 404 that explains packs expire. */
export function entryOr404(ctx, id = ctx.params.id) {
  const entry = ctx.pending.get(id);
  if (!entry)
    throw new HttpError(
      404,
      'This uploaded pack is no longer available (packs are kept for 30 minutes and are not saved). Upload it again.',
    );
  return entry;
}

const reviewPage = (ctx, entry, collision, problems = []) => ({
  title: `Review ${entry.pack.site.orgName ?? 'site pack'}`,
  crumbs: [['Review site pack']],
  body: packReview({ id: ctx.params.id, entry, csrf: ctx.csrf, collision, problems }),
});

export function showPack(ctx) {
  const entry = entryOr404(ctx);
  // Collisions are re-checked against the registry as it is now, not as it was at upload.
  return reviewPage(ctx, entry, ctx.content.snapshot().registry.order.includes(entry.pack.site.slug));
}

export async function importPack(ctx) {
  const entry = entryOr404(ctx);
  const snap = ctx.content.snapshot();
  const { pack } = entry;
  const slug = pack.site.slug;
  const collision = snap.registry.order.includes(slug);
  if (pack.problems.length) return { status: 422, ...reviewPage(ctx, entry, collision) };
  if (collision && !ctx.form.has('replace'))
    return {
      status: 409,
      ...reviewPage(ctx, entry, collision, [`/${slug} already exists: tick "Replace existing site" to overwrite it.`]),
    };
  const current = collision ? snap.find(slug) : null;
  const { site, registry } = prepareImport(pack, {
    registry: snap.registry,
    current,
    publish: ctx.form.has('publish'),
    root: ctx.form.has('root'),
  });
  const extraFiles = Object.fromEntries(Object.entries(pack.og).map(([name, data]) => [`public/og/${name}`, data]));
  const verb = current ? 'replace' : 'import';
  const result = await ctx.content.saveSite(snap, site, { registry, extraFiles, message: `content(${slug}): ${verb} site pack` });
  const render = problems => reviewPage(ctx, entry, collision, problems);
  if (result.problems) return { status: 422, ...render(result.problems) };
  ctx.pending.delete(ctx.params.id);
  const redirect = `/sites/${slug}`;
  if (site.active !== false) {
    const published = afterPublish(result, redirect, render, site);
    return { ...published, flash: { ...published.flash, text: `Imported ${site.orgName}. ${published.flash.text}` } };
  }
  const response = afterSave(result, redirect, render);
  return {
    ...response,
    flash: {
      ...response.flash,
      text: `Imported ${site.orgName}. It is inactive; tick licences and work through verification before publishing. ${response.flash.text}`,
      links: [
        { href: `/sites/${slug}/licences`, label: 'Licences' },
        { href: `/sites/${slug}/verification`, label: 'Verification' },
      ],
    },
  };
}

export function discardPack(ctx) {
  entryOr404(ctx);
  ctx.pending.delete(ctx.params.id);
  return { redirect: '/', flash: { text: 'Discarded the uploaded pack. Nothing was written.', kind: 'info' } };
}

/** GET /sites/:slug/pack: the stored site as a pack (read-only), with its og cards. */
export function downloadPack(ctx) {
  const site = siteOr404(ctx.content.snapshot(), ctx.params.slug);
  const data = buildPack(site, { ogDir: new URL('og/', ctx.content.publicDir), generator: 'peptalk-appearances admin download' });
  return { download: { filename: packName(site.slug), type: 'application/zip', data } };
}
