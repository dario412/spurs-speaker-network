// The tracking slot's loader (lib/tracking.ts; docs/architecture.md → Tracking and consent). components/document.tsx
// adds it, with `defer`, only to pages of a site with tags, configured by its own data attributes:
//   data-gtm-id="GTM-…"  data-ga4-id="G-…"  data-consent="required" (tags wait for the visitor's yes)
// It loads Google Tag Manager and/or GA4 from https://www.googletagmanager.com, straight away or after consent, and
// shows the consent banner when needed. DOM calls only (no HTML strings). Under the page's Trusted Types policy a
// script URL must pass the `default` policy created here, which accepts that one origin over https and nothing else;
// the proxy allows `trusted-types default` and Google's hosts only for sites with tags.
// The constants below mirror lib/tracking.ts (test/next/tracking.test.ts checks they match and runs this file).
(() => {
  const ORIGIN = 'https://www.googletagmanager.com';
  const COOKIE = 'pa_consent';
  const MAX_AGE = 15724800;
  const script = document.currentScript;
  if (!script) return;
  const { gtmId, ga4Id, consent } = script.dataset;

  const allowed = value => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return url.origin === ORIGIN && url.protocol === 'https:';
  };

  const stored = () => {
    for (const part of document.cookie.split(';')) {
      const [name, value] = part.trim().split('=');
      if (name === COOKIE && (value === 'granted' || value === 'denied')) return value;
    }
    return null;
  };

  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    if (window.trustedTypes && !window.trustedTypes.defaultPolicy) {
      try {
        window.trustedTypes.createPolicy('default', { createScriptURL: value => (allowed(value) ? value : null) });
      } catch (error) {
        console.warn('Tracking: Trusted Types policy unavailable', error);
      }
    }
    window.dataLayer = window.dataLayer || [];
    const dataLayer = window.dataLayer;
    const sources = [];
    if (gtmId) {
      dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      sources.push(`${ORIGIN}/gtm.js?id=${encodeURIComponent(gtmId)}`);
    }
    if (ga4Id) {
      // gtag() queues its `arguments` object; GA4 reads the queue in that shape.
      const gtag = function () {
        // biome-ignore lint/complexity/noArguments: gtag.js expects the arguments object itself.
        dataLayer.push(arguments);
      };
      gtag('js', new Date());
      gtag('config', ga4Id);
      sources.push(`${ORIGIN}/gtag/js?id=${encodeURIComponent(ga4Id)}`);
    }
    for (const src of sources) {
      const tag = document.createElement('script');
      tag.async = true;
      tag.src = src;
      document.head.append(tag);
    }
  };

  const decide = (choice, banner) => {
    // biome-ignore lint/suspicious/noDocumentCookie: one first-party cookie; the Cookie Store API isn't in every supported browser.
    document.cookie = `${COOKIE}=${choice}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    banner.remove();
    if (choice === 'granted') load();
  };

  const showBanner = () => {
    const banner = document.createElement('aside');
    banner.className = 'consent-banner';
    banner.setAttribute('aria-label', 'Cookie choices');
    const text = document.createElement('p');
    text.textContent =
      "We'd like to use analytics cookies to understand how this site is used. They are only set if you accept. You can change your mind by clearing this site's cookies.";
    const actions = document.createElement('div');
    actions.className = 'consent-actions';
    const button = (label, className, choice) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = className;
      node.textContent = label;
      node.addEventListener('click', () => decide(choice, banner));
      return node;
    };
    actions.append(button('Accept analytics cookies', 'btn btn-blue', 'granted'), button('Reject', 'btn btn-line', 'denied'));
    banner.append(text, actions);
    document.body.append(banner);
  };

  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[data-event-spaces]');
    if (!loaded || !link?.href) return;
    const params = {
      brand: link.dataset.brand,
      link_url: link.href,
      link_text: link.textContent.trim(),
      page_path: location.pathname,
      transport_type: 'beacon',
    };
    if (gtmId) window.dataLayer.push({ event: 'event_spaces_click', ...params });
    if (ga4Id) {
      const gtag = function () {
        // biome-ignore lint/complexity/noArguments: gtag.js expects the arguments object itself.
        window.dataLayer.push(arguments);
      };
      gtag('event', 'event_spaces_click', { ...params, send_to: ga4Id });
    }
  });

  const choice = stored();
  if (consent !== 'required' || choice === 'granted') load();
  else if (choice === null) showBanner();
})();
