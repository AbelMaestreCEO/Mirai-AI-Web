// Compila la app Quasar (frontend/) a public/app/.
//
// Lo ejecuta wrangler antes de cada deploy y de `wrangler dev` ([build] en
// wrangler.toml), también en Workers Builds, donde frontend/node_modules no
// existe: entonces instala primero con `npm ci`. En local, si ya está
// instalado, solo compila.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const frontend = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend');
// Con shell (necesario para npm.cmd en Windows) se pasa el comando entero como
// texto: pasarlo como lista de argumentos está deprecado (DEP0190).
function run(command) {
  const res = spawnSync(command, { cwd: frontend, stdio: 'inherit', shell: true });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

if (!existsSync(path.join(frontend, 'node_modules'))) run('npm ci');
run('npm run build');
