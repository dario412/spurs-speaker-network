'use client';
// Page behaviour (menu, roster filters held in the URL, shortlist, enquiry validation) from lib/behaviour.ts,
// started after hydration so React never sees DOM it didn't render. Not mounted on demo pages.
import { useEffect } from 'react';
import { startBehaviour } from '../lib/behaviour.ts';

export function Behaviour() {
  useEffect(() => startBehaviour(document), []);
  return null;
}
