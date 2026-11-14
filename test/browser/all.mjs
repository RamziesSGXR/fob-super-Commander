// Runs every browser check in turn against the running page (npm start first). Exits non-zero if any fails.
import { spawnSync } from 'node:child_process';
let bad = 0;
for (const t of ['land', 'hud', 'hq', 'refit', 'ops', 'build', 'zones', 'utils']) {
  const r = spawnSync(process.execPath, [`test/browser/${t}.mjs`], { encoding: 'utf8', timeout: 420000 });
  const out = (r.stdout + r.stderr).trim().split('\n').filter(l => !/agent-proxy|ERR_TUNNEL/.test(l));
  console.log(`== ${t}: ${r.status === 0 ? 'ok' : 'FAILED'}\n${out.slice(-3).join('\n')}`); if (r.status !== 0) bad++;
}
process.exitCode = bad ? 1 : 0;
