// Default storage: write content files into the local checkout. Publishing stays a normal Git change.
import { writeFiles } from '../../sites/store.mjs';

const names = paths => paths.map(path => path.replace(/^src\/sites\//, '')).join(', ');

/** @param {{ dir: URL, publicDir?: URL }} options the src/sites/ directory, and public/ for og cards from site packs */
export function fsStorage({ dir, publicDir }) {
  return {
    name: 'fs',
    describe: () => ({
      label: 'Local files',
      detail: 'Saves write to src/sites/ in this checkout. Run npm run check, commit and open a PR; changes go live on the next deploy.',
    }),
    async save(files) {
      await writeFiles(files, dir, publicDir ? { publicDir } : {});
      return { message: `Saved ${names(Object.keys(files))}. Run npm run check, commit and open a PR to publish.` };
    },
  };
}
