const path = require('path');
const { execFileSync } = require('child_process');
const express = require('express');
const registerLegacyRoutes = require('./index');

const app = express();
const port = Number(process.env.PORT || 4200);
const host = process.env.HOST || '0.0.0.0';
const distDir = path.resolve(__dirname, '..', 'dist');

function resolveCommit() {
  if (process.env.LOTEDIRETOR_COMMIT) return process.env.LOTEDIRETOR_COMMIT;

  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_error) {
    return null;
  }
}

const releaseCommit = resolveCommit();

app.disable('x-powered-by');

app.get('/healthz', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'lotediretor-web',
    commit: releaseCommit,
  });
});

registerLegacyRoutes(app);

app.use(
  express.static(distDir, {
    index: false,
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    etag: true,
  })
);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    next();
    return;
  }

  res.sendFile(path.join(distDir, 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(
    `LoteDiretor production web listening on http://${host}:${port} (${distDir})`
  );
});
