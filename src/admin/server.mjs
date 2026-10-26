// Admin entry point (`npm run admin`): reads the environment, refuses unsafe binds, listens on loopback by default.
import { SITES_DIR } from '../sites/index.mjs';
import { createAdmin } from './app.mjs';
import { isLoopback, log } from './http.mjs';
import { storageFromEnv } from './storage/index.mjs';

const host = process.env.ADMIN_HOST || '127.0.0.1';
const port = Number(process.env.ADMIN_PORT) || 3095;
const password = process.env.ADMIN_PASSWORD || '';

// Without a password the loopback bind is the only access control, so any other address is refused outright.
if (!password && !isLoopback(host)) {
  log('admin.refused', { reason: 'ADMIN_PASSWORD is required when ADMIN_HOST is not a loopback address', host });
  process.exit(1);
}

let storage;
try {
  storage = storageFromEnv(process.env, { dir: SITES_DIR });
} catch (error) {
  log('admin.refused', { reason: error.message });
  process.exit(1);
}

const server = createAdmin({ dir: SITES_DIR, password, storage });
server.listen(port, host, () => {
  const { port: bound } = server.address();
  const shown = host.includes(':') ? `[${host}]` : host;
  log('admin.started', { url: `http://${shown}:${bound}/`, storage: storage.name, passwordGate: Boolean(password) });
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    log('admin.stopping', { signal });
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
