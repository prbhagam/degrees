// Owner: Christian (Server & Infra) — one-command dev: API server in the background, Expo in the foreground.
// Expo needs the real terminal (TTY) to print its QR code and handle keys like `i` (iOS simulator),
// which is why this isn't `concurrently` — piping Expo's output makes it non-interactive.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const server = spawn(npm, ['run', 'dev', '-w', '@degrees/server'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: process.platform === 'win32',
});
for (const stream of [server.stdout, server.stderr]) {
  createInterface({ input: stream }).on('line', (line) => {
    process.stdout.write(`\x1b[34m[server]\x1b[0m ${line}\n`);
  });
}

const mobile = spawn(
  npm,
  ['run', 'start', '-w', '@degrees/mobile', '--', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);

let shuttingDown = false;
function killChild(child) {
  if (!child || !child.pid) return;
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], {
        stdio: 'ignore',
      });
    } catch {
      child.kill('SIGTERM');
    }
  } else {
    child.kill('SIGTERM');
  }
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  killChild(server);
  killChild(mobile);
  process.exitCode = code;
}

server.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(
      `[server] exited with code ${code ?? 'null'} — stopping Expo too.`,
    );
    shutdown(code ?? 1);
  }
});
mobile.on('exit', (code) => shutdown(code ?? 0));
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
