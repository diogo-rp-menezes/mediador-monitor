import { env } from './config.js';
import { openDb, listar, importarLegado } from './db.js';
import { executarMonitor } from './monitoring/runner.js';
import { reanalisar } from './reanalisar.js';

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'check') {
  const r = await executarMonitor({ dryRun: rest.includes('--dry-run'), seed: rest.includes('--seed') });
  if (r.falhas) process.exitCode = 1;
} else if (cmd === 'list') console.table(listar(openDb(env.dbPath)));
else if (cmd === 'importar-legado') console.log(importarLegado(openDb(env.dbPath)));
else if (cmd === 'reanalisar') {
  const db = openDb(env.dbPath);
  const alvos = rest[0] ? [rest[0]] : (db.prepare('SELECT numero_registro FROM registros WHERE arquivo_path IS NOT NULL').all() as Array<{ numero_registro: string }>).map(x=>x.numero_registro);
  for (const n of alvos) await reanalisar(db, n).then(() => console.log('OK',n), e => console.warn(n,(e as Error).message));
} else console.log('Uso: npm run check | npm run check:dry | npm run seed | npm run reanalisar | npm run importar-legado');
