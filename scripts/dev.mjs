// StudySmart — one-command dev launcher.
//
// WHY THIS EXISTS
// Smart Summarize / Practice / Flashcards all call the local AI backend
// (server/summarizeServer.mjs). Before this launcher, `npm run dev` started only
// the web app, so whenever the backend was not running in a second terminal every
// generation failed and the student saw a generic "couldn't generate your
// summary" error. This script starts both, re-reports the real status, and
// restarts the backend if it dies — so "the AI service is running" stops being
// something the developer has to remember.
//
// Run:  npm run dev            (web + AI backend)
//       npm run dev -- --host  (also reachable from other devices on the LAN)

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---- read the backend port from server/.env (defaults to 8787) -----------
function readServerEnvPort() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, 'server', '.env'), 'utf8');
    const m = raw.match(/^PORT=(\d+)/m);
    if (m) return Number(m[1]);
  } catch {
    /* fall through to default */
  }
  return Number(process.env.PORT || 8787);
}

const AI_PORT = readServerEnvPort();
const AI_HEALTH_URL = `http://localhost:${AI_PORT}/health`;

async function probeHealth(timeoutMs = 1500) {
  try {
    const res = await fetch(AI_HEALTH_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function prefixStream(stream, prefix, sink) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) sink(`${prefix} ${line}`);
  });
  stream.on('end', () => {
    if (buffer.trim()) sink(`${prefix} ${buffer}`);
  });
}

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
  // Give the children a moment, then leave regardless (Windows has no signals).
  setTimeout(() => process.exit(code), 800).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function startBackend(label) {
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'summarizeServer.mjs')], {
    cwd: ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  prefixStream(child.stdout, `[${label}]`, (line) => console.log(line));
  prefixStream(child.stderr, `[${label}]`, (line) => console.error(line));
  return child;
}

async function waitForBackend(tries = 10) {
  for (let i = 0; i < tries; i += 1) {
    const health = await probeHealth();
    if (health) return health;
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

async function main() {
  const banner = 'StudySmart dev launcher';
  console.log(`\n  ${banner}`);
  console.log(`  → AI backend: ${AI_HEALTH_URL}`);

  // 1. Reuse a healthy backend instead of starting a duplicate (which would die
  //    on EADDRINUSE and look like a broken install).
  let health = await probeHealth();
  let backend = null;
  if (health) {
    console.log(`  ✓ AI backend already running — reusing it (provider ${health.provider}, key ${health.keyConfigured ? 'configured' : 'MISSING'}).`);
  } else {
    backend = startBackend('ai');
    health = await waitForBackend();
    if (!health) {
      console.error(
        `  ✗ The AI backend did not answer on port ${AI_PORT}. It may have crashed on startup — see the messages above.`,
      );
    } else {
      console.log(
        `  ✓ AI backend started (provider ${health.provider}, key ${health.keyConfigured ? 'configured' : 'MISSING — add GEMINI_API_KEY to server/.env'}).`,
      );
    }
  }

  if (health && !health.keyConfigured) {
    console.warn('  ⚠ Without a real AI key the app will honestly report a configuration error instead of inventing summaries.');
  }

  // 2. Watch the backend: if it dies, restart it so an open browser tab recovers.
  if (backend) {
    let restarts = 0;
    const watchDog = () => {
      backend.on('exit', async (code, signal) => {
        if (shuttingDown) return;
        restarts += 1;
        if (restarts > 3) {
          console.error(
            `  ✗ The AI backend keeps exiting (last code ${code ?? signal}). Stop here — fix the error above, then run npm run dev again.\n`,
          );
          shutdown(1);
          return;
        }
        console.warn(`  ! AI backend exited (code ${code ?? signal}); restarting it (${restarts}/3)...`);
        await new Promise((r) => setTimeout(r, 700));
        backend = startBackend('ai');
        const again = await waitForBackend();
        if (again) console.log(`  ✓ AI backend back up on port ${AI_PORT}.`);
        watchDog();
      });
    };
    watchDog();
  }

  // 3. Start the web app last so its proxy always has a backend to talk to.
  const webArgs = [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), ...process.argv.slice(2)];
  const web = spawn(process.execPath, webArgs, { cwd: ROOT, env: process.env, stdio: ['inherit', 'pipe', 'pipe'] });
  children.push(web);
  prefixStream(web.stdout, '[web]', (line) => console.log(line));
  prefixStream(web.stderr, '[web]', (line) => console.error(line));

  web.on('exit', (code) => shutdown(code ?? 0));
  web.on('error', (err) => {
    console.error('  ✗ Could not start the web app:', err?.message ?? err);
    shutdown(1);
  });
}

main().catch((err) => {
  console.error('Launcher failed:', err);
  process.exit(1);
});
