// Renders preview pages with the Next.js app's own components (components/, lib/) from content held in memory, so
// the admin preview shows exactly what the app will build, inactive sites and unsaved site packs included. Pages
// render with react-dom/server's renderToStaticMarkup inside the app's <Document> shell, and resolvePage() decides
// which pages exist, as it does for app/. What the preview leaves out: the Metadata API's head tags (a plain
// <title> stands in), Next.js framework scripts and the hydrated behaviour (menu, filters, shortlist), and the image
// optimizer (photos load from their source; see image-shim.mjs). Decision and trade-offs: docs/admin.md, "Preview".
import { register } from 'node:module';

const REPO = new URL('../../../', import.meta.url);
let loading;

/** Registers the .tsx hooks once and imports the app modules the preview needs. */
function modules() {
  loading ??= (async () => {
    register('./hooks.mjs', import.meta.url);
    const app = path => import(new URL(path, REPO).href);
    const [react, server, home, pages, landing, documentShell, context, publish, routes, theme, assets, text, indexing, origin, json] =
      await Promise.all([
        import('react'),
        import('react-dom/server'),
        app('components/site/home.tsx'),
        app('components/site/pages.tsx'),
        app('components/landing.tsx'),
        app('components/document.tsx'),
        app('lib/render/context.ts'),
        app('lib/content/publish.ts'),
        app('lib/render/routes.ts'),
        app('lib/render/theme.ts'),
        app('lib/render/assets.ts'),
        app('lib/render/text.ts'),
        app('lib/seo/indexing.ts'),
        app('lib/origin.ts'),
        app('lib/content/json-provider.ts'),
      ]);
    const legal = json.createJsonProvider({ legalDir: new URL('src/copy/legal', REPO).pathname, cache: false });
    return {
      h: react.createElement,
      server,
      home,
      pages,
      landing,
      documentShell,
      context,
      publish,
      routes,
      theme,
      assets,
      text,
      indexing,
      origin,
      legal,
    };
  })();
  return loading;
}

/** Loads the renderer ahead of the first preview (the first load compiles the components: a few hundred ms). */
export const ready = () => modules().then(() => true);

/** A stored site (as loadSite returns it) as the app publishes it: hidden people out, bookkeeping files dropped. */
export async function published(raw) {
  return (await modules()).publish.publishable(raw);
}

export async function siteCss(site) {
  return (await modules()).theme.siteStylesheet(site);
}

export async function landingCss(sites) {
  return (await modules()).theme.landingStylesheet(sites);
}

const TITLES = {
  home: 'Home',
  legends: 'Legends',
  'ways-to-book': 'Ways to book',
  hospitality: 'Hospitality',
  about: 'About',
  'check-availability': 'Check availability',
  terms: 'Terms',
  privacy: 'Privacy',
};

/**
 * One page of the app, rendered from `sites` (already published, see published()).
 * @param {string} pathname the app path, e.g. "/spurs/legends/sandro"
 * @param {object[]} sites the sites the page may come from
 * @param {{ hubIndexable?: boolean, landing?: string }} [options] `landing`: the landing page's URL (`/`, or `/all` when a
 *   root site takes `/`), for its own links, the hub breadcrumbs and structured data
 * @returns {Promise<{ status: number, html: string }>}
 */
export async function renderPage(pathname, sites, { hubIndexable = false, landing = '/' } = {}) {
  const m = await modules();
  const { h } = m;
  const page = m.routes.resolvePage(sites, pathname);
  // The Metadata API isn't rendered here, so the title and icon it would add (the site's crest) stand in by hand.
  const html = (title, tree, icon = '/peptalk/favicon.png') =>
    `<!doctype html>\n${m.server
      .renderToStaticMarkup(tree)
      .replace(
        '<head>',
        `<head><meta charset="utf-8"><title>${escapeHtml(title)} · admin preview</title><link rel="icon" href="${escapeHtml(icon)}">`,
      )}`;
  const hubDocument = (stylesheets, children) =>
    h(m.documentShell.Document, { lang: 'en-GB', bodyClass: 'landing', fonts: m.assets.LANDING_FONTS, stylesheets }, children);

  if (!page) return { status: 404, html: html('Not found', hubDocument([], h(m.landing.NotFoundPage))) };
  if (page.kind === 'landing') {
    const tree = h(m.landing.LandingPage, { sites, origin: m.origin.publicOrigin(), indexable: hubIndexable, path: landing });
    return { status: 200, html: html('PepTalk Appearances', hubDocument([m.assets.landingStylesheetHref(sites)], tree)) };
  }
  if (page.kind === 'hub-legal') {
    const doc = await m.legal.getLegal(page.legal);
    const tree = h(m.landing.HubLegalPage, { doc, origin: m.origin.publicOrigin(), indexable: hubIndexable, landing });
    return { status: 200, html: html(doc.title, hubDocument([], tree)) };
  }

  const { site, person, demo, kind } = page;
  const ctx = m.context.siteContext(site, { demo });
  const P = m.pages;
  const body = {
    home: () => h(m.home.HomePage, { ctx }),
    legends: () => h(P.LegendsPage, { ctx }),
    profile: () => h(P.ProfilePage, { ctx, person }),
    'ways-to-book': () => h(P.WaysToBookPage, { ctx }),
    hospitality: () => h(P.HospitalityPage, { ctx }),
    about: () => h(P.AboutPage, { ctx }),
    'check-availability': () => h(P.CheckAvailabilityPage, { ctx }),
  }[kind];
  const content = body ? body() : h(P.SiteLegalPage, { ctx, doc: await m.legal.getLegal(kind) });
  const tree = h(
    m.documentShell.Document,
    {
      lang: m.indexing.langFor(site),
      bodyClass: `site-${site.slug}`,
      stylesheets: [m.assets.siteStylesheetHref(site)],
      fonts: m.assets.siteFonts(site),
      preconnect: m.assets.markOrigins(site),
      orgName: m.text.decode(site.orgName),
    },
    content,
  );
  const title = `${kind === 'profile' ? m.text.decode(person.name) : TITLES[kind]} | ${m.text.decode(site.platform)}`;
  return { status: 200, html: html(title, tree, site.marks?.crest || undefined) };
}

const escapeHtml = value => String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
