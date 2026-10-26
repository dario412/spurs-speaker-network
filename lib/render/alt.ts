// Alt text for content photos, from data only: the person's name plus their position line, or a slot's caption.
// Decorative photos (no caption data, or a name already spelled out beside them) take alt="" at the call site.
import type { Person } from '../content/types.ts';

const parts = (text: string) => text.split(/\s*·\s*/).filter(Boolean);

/** "Sandro, defensive midfielder, Tottenham Hotspur 2010–2014, Brazil": the name plus the profile's position line. */
export const personAlt = (person: Pick<Person, 'name' | 'pos'>): string => [person.name, ...parts(person.pos)].join(', ');

/** "Sandro, midfielder, 2010–2014" for a named slot (home hero and inset), from its name and caption line. */
export const slotAlt = (slot: { name: string; line: string }): string => [slot.name, ...parts(slot.line)].join(', ');
