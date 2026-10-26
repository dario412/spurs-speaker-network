// Content photos are real <img> elements (Google Images indexes <img>, not CSS backgrounds), served through the Next.js
// image optimizer for a responsive srcset in WebP. getImageProps() gives the attributes; its inline `style` is dropped
// because the CSP forbids inline styles: `.photo > .ph` in public/styles.css does the same job (absolute fill,
// object-fit: cover), and the slot's CSS height reserves the space, so nothing shifts while images load.
// Alt text helpers live in lib/render/alt.ts (no Next.js import, so plain Node tests can use them).
// See docs/architecture.md, "Images".
import { getImageProps } from 'next/image';

/** Where a photo sits; picks the `sizes` hint, matched to the layout breakpoints in public/styles.css. */
export type Slot = 'card' | 'hero' | 'mini' | 'profile' | 'split' | 'gallery' | 'gallery-lead' | 'cat' | 'tile' | 'person';

export const SIZES: Record<Slot, string> = {
  card: '(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 380px',
  hero: '(max-width: 960px) 100vw, 560px',
  mini: '160px',
  profile: '(max-width: 960px) 100vw, 520px',
  split: '(max-width: 960px) 100vw, 560px',
  gallery: '(max-width: 760px) 50vw, 260px',
  'gallery-lead': '(max-width: 760px) 100vw, 420px',
  cat: '(max-width: 760px) 50vw, 300px',
  tile: '(max-width: 760px) 100vw, 380px',
  person: '(max-width: 760px) 50vw, 280px',
};

export interface PhotoOptions {
  alt: string;
  slot: Slot;
  /** The page's LCP candidate: eager, high fetch priority. */
  priority?: boolean;
  /** Above the fold but not the LCP image: eager, normal priority. */
  eager?: boolean;
}

export type ImgAttributes = Omit<ReturnType<typeof getImageProps>['props'], 'style'>;

/** <img> attributes for a content photo (src, srcSet, sizes, alt, loading, decoding, fetchPriority), without style. */
export function photoAttributes(src: string, { alt, slot, priority = false, eager = false }: PhotoOptions): ImgAttributes {
  const { props } = getImageProps({
    src,
    alt,
    fill: true,
    sizes: SIZES[slot],
    loading: priority || eager ? 'eager' : 'lazy',
    ...(priority ? { fetchPriority: 'high' as const } : {}),
  });
  const { style: _style, ...attributes } = props;
  return attributes;
}
