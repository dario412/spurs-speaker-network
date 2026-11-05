'use client';
// Page behaviour (menu, roster filters held in the URL, shortlist, enquiry validation) from lib/behaviour.ts,
// started after hydration so React never sees DOM it didn't render. Not mounted on demo pages.
// For signed-in CMS editors (the CMS's marker cookie) it also starts the visual editor; the editor's API checks the
// real session. It is bundled rather than loaded on demand: chunk loading sets script.src, which Trusted Types block.
import { useEffect } from 'react';
import { startBehaviour } from '../lib/behaviour.ts';
import { startVisualEditor } from '../lib/visual-editor/client.ts';

const EDITOR_COOKIE = 'pt_cms_edit=1';

export function Behaviour() {
  useEffect(() => {
    // ?edit=1 comes from the CMS's "Edit on the page" buttons; the cookie keeps the bar on while browsing. Read before
    // startBehaviour, whose roster filters rewrite the query string.
    const autoEdit = new URLSearchParams(location.search).get('edit') === '1';
    if (!autoEdit && !document.cookie.split('; ').includes(EDITOR_COOKIE)) return;
    startVisualEditor(document, { autoEdit }).catch(error => console.warn('Visual editor unavailable', error));
  }, []);
  useEffect(() => startBehaviour(document), []);
  return null;
}
