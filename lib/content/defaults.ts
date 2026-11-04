// Typed view of the shared defaults in src/copy/defaults.mjs. The admin and the validator read the same file,
// so there is one source of default wording, formats and FAQ (no copy to drift).
import * as base from '../../src/copy/defaults.mjs';
import type { FaqEntry, Format, FormatKey, Vocab } from './types.ts';

export const VOCAB = base.VOCAB as Vocab;
export const FORMATS = base.FORMATS as Record<FormatKey, Format>;
export const HOME_FORMATS = base.HOME_FORMATS as FormatKey[];
export const DEFAULT_FORMAT_KEYS = base.DEFAULT_FORMAT_KEYS as FormatKey[];
export const FAQ = base.FAQ as FaqEntry[];
