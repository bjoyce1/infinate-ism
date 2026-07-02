// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      {
        name: 'mock-force-graph-ssr',
        enforce: 'pre',
        resolveId(id, importer, options) {
          if (options?.ssr && (id === 'react-force-graph-3d' || id === 'react-force-graph-2d' || id === '3d-force-graph' || id === 'force-graph')) {
            return '\0mock-' + id;
          }
        },
        load(id) {
          if (id.startsWith('\0mock-')) {
            return 'export default function() { return null; }';
          }
        }
      }
    ]
  }
});
