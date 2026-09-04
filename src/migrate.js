// Aplica las migraciones de migrations/ en orden numerico.
// Uso: npm run db:migrate
//
// Las migraciones son idempotentes, asi que repetir el comando no rompe
// nada. Aun asi se registran en la tabla schema_migrations y las ya
// aplicadas se saltan, para que la salida diga con claridad que hizo.
//
// Los mismos archivos se pueden pegar a mano en el SQL Editor de Supabase;
// ver migrations/README.md.
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const db = require('./db');

const DIR = path.join(__dirname, '..', 'migrations');

/** Archivos .sql ordenados por su numero (001, 002, ...). */
function listar({ soloEsquema = false } = {}) {
  return fs.readdirSync(DIR)
    .filter(f => f.endsWith('.sql'))
    // Las migraciones de datos se omiten en los tests, que cargan los suyos.
    .filter(f => !(soloEsquema && f.includes('datos_')))
    .sort();
}

/** Versiones ya registradas, o vacio si la tabla aun no existe. */
async function yaAplicadas() {
  try {
    const filas = await db.all('select version from schema_migrations');
    return new Set(filas.map(f => f.version));
  } catch {
    return new Set();
  }
}

async function aplicar({ soloEsquema = false } = {}) {
  if (db.SCHEMA !== 'public') {
    await db.query(`create schema if not exists ${db.SCHEMA}`);
  }

  const aplicadas = await yaAplicadas();
  const archivos = listar({ soloEsquema });
  let nuevas = 0;

  for (const archivo of archivos) {
    const version = archivo.slice(0, 3);
    if (aplicadas.has(version)) {
      console.log(`  ${archivo}  (ya aplicada)`);
      continue;
    }
    await db.query(fs.readFileSync(path.join(DIR, archivo), 'utf8'));
    console.log(`  ${archivo}  APLICADA`);
    nuevas++;
  }

  return { total: archivos.length, nuevas };
}

module.exports = { aplicar, listar, DIR };

// Solo actua como script cuando se ejecuta directamente, no al importarse
// desde los tests.
if (require.main === module) {
  (async () => {
    console.log(`Aplicando migraciones sobre "${db.SCHEMA}":\n`);
    const { total, nuevas } = await aplicar();

    const tablas = await db.all(
      `select c.relname as tabla, c.relrowsecurity as rls
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = $1 and c.relkind = 'r' and c.relname <> 'schema_migrations'
        order by c.relname`,
      [db.SCHEMA]
    );

    console.log(`\n${nuevas} de ${total} migraciones aplicadas ahora.\n`);
    tablas.forEach(t => console.log(`  ${t.tabla.padEnd(12)} RLS ${t.rls ? 'activo' : 'INACTIVO'}`));
  })()
    .catch(e => { console.error('Fallo la migracion:', e.message); process.exitCode = 1; })
    .finally(() => db.pool.end());
}
