// Aplica db/schema.sql sobre la base configurada en DATABASE_URL.
// Uso: npm run db:migrate
//
// El esquema es idempotente (create table if not exists), asi que se puede
// ejecutar cuantas veces haga falta.
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const db = require('./db');

const SCHEMA_SQL = path.join(__dirname, '..', 'db', 'schema.sql');

async function migrate() {
  const sql = fs.readFileSync(SCHEMA_SQL, 'utf8');

  // El esquema de tests no existe hasta que se crea aqui.
  if (db.SCHEMA !== 'public') {
    await db.query(`create schema if not exists ${db.SCHEMA}`);
  }

  await db.query(sql);

  const tablas = await db.all(
    `select c.relname as tabla, c.relrowsecurity as rls
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relkind = 'r'
      order by c.relname`,
    [db.SCHEMA]
  );

  console.log(`Esquema aplicado sobre "${db.SCHEMA}".`);
  tablas.forEach(t => console.log(`  ${t.tabla.padEnd(12)} RLS ${t.rls ? 'activo' : 'INACTIVO'}`));
}

migrate()
  .catch(e => { console.error('Fallo la migracion:', e.message); process.exitCode = 1; })
  .finally(() => db.pool.end());
