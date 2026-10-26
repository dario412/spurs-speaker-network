// Stands in for next/image's getImageProps() in the admin preview (hooks.mjs maps the import here). The app serves
// photos through the image optimizer (/_next/image, srcset); the admin has none, so the browser loads the original
// file. The attributes lib/render/images.ts keeps are the same, so the markup only loses the srcset.
export function getImageProps({ src, alt, sizes, loading, fetchPriority, decoding = 'async' }) {
  return { props: { src, alt, sizes, loading, fetchPriority, decoding } };
}
