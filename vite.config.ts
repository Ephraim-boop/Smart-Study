import { defineConfig } from 'vite';
import type { ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

// The local AI backend (server/summarizeServer.mjs). `npm run dev` starts it for
// you; see scripts/dev.mjs.
const AI_ORIGIN = process.env.AI_BACKEND_ORIGIN || 'http://localhost:8787';

// All AI traffic goes through /ai on the SAME origin as the app and is forwarded
// to the backend. Why: a browser-side call to http://localhost:8787 points at the
// *student's own* machine, so any device other than this computer could never
// reach the AI service. Proxied through the dev/preview server, one origin serves
// both the UI and the AI routes, no CORS rules to maintain, and devices on the
// LAN (npm run dev -- --host) work too.
const aiProxy: Record<string, ProxyOptions> = {
  '/ai': {
    target: AI_ORIGIN,
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/ai/, ''),
    // If the backend is down, answer with a machine-readable cause instead of an
    // HTML error page, so the UI can say what is actually wrong.
    configure: (proxy) => {
      proxy.on('error', (err, _req, res) => {
        const reason = (err as { code?: string } | undefined)?.code || err?.message || 'unknown error';
        const statusCode = 503;
        const payload = JSON.stringify({
          ok: false,
          code: 'AI_BACKEND_DOWN',
          message: `The AI service on this computer is not reachable (${reason}). It normally starts automatically with "npm run dev".`,
        });
        if (res && 'writeHead' in res && !res.headersSent) {
          res.writeHead(statusCode, { 'Content-Type': 'application/json' });
          res.end(payload);
        }
      });
    },
  },
};

export default defineConfig({
  plugins: [react()],
  server: { proxy: aiProxy },
  preview: { proxy: aiProxy },
});
