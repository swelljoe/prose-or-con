import { defineConfig } from 'vite';

// Served from root on the custom domain (prose-or-con.com), so base is '/'.
// For project-page hosting instead (https://<user>.github.io/<repo>/), set
// VITE_BASE=/<repo>/ at build time.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  // Bind all interfaces so the dev/preview server is reachable from outside the VM.
  server: { host: true },
  preview: { host: true },
  build: { target: 'es2022' },
});
