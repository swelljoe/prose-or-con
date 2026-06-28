import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { splitCorpus } from './scripts/split-corpus';

const publicDir = fileURLToPath(new URL('public', import.meta.url));
const distCorpus = fileURLToPath(new URL('dist/corpus.json', import.meta.url));

// Regenerate the served corpus split (index + per-item files) from the
// committed monolith on every dev start and build, then drop the monolith
// itself from the build output — nothing fetches it, and it's the full answer
// key. This is the "split in the publish job" step; the split is gitignored.
function splitCorpusPlugin(): Plugin {
  return {
    name: 'split-corpus',
    // configResolved (not buildStart) so the files exist before the dev server
    // scans publicDir on cold start; runs for both `dev` and `build`.
    configResolved(config) {
      const n = splitCorpus(publicDir);
      config.logger.info(`[split-corpus] index + ${n} item files`);
    },
    closeBundle: {
      order: 'post',
      handler() {
        rmSync(distCorpus, { force: true });
      },
    },
  };
}

// Served from root on the custom domain (prose-or-con.com), so base is '/'.
// For project-page hosting instead (https://<user>.github.io/<repo>/), set
// VITE_BASE=/<repo>/ at build time.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [splitCorpusPlugin()],
  // Bind all interfaces so the dev/preview server is reachable from outside the VM.
  server: { host: true },
  preview: { host: true },
  build: { target: 'es2022' },
});
