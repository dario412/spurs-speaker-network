// Skip link and concept banner: the first thing in every page body.
// The banner says the content is a placeholder preview, so it goes once a site is launched (indexable).
import { A } from './site/primitives.tsx';

export function Concept({ demo = false, banner = true }: { demo?: boolean; banner?: boolean }) {
  return (
    <>
      <A demo={demo} className="skip" href="#main">
        Skip to content
      </A>
      {banner ? (
        <div className="concept">Concept preview with placeholder content and watermarked images. Not for public distribution.</div>
      ) : null}
    </>
  );
}
