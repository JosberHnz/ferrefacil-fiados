// Genera docs/db-export.json a partir del esquema REAL de la base (no escrito
// a mano), consultando information_schema y los catalogos de PostgreSQL.
// Uso: npm run export-schema
//
// La version anterior leia sqlite_master y PRAGMA, especificos de SQLite.
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const db = require('./db');

async function exportar() {
  const tablas = await db.all(
    `select tablename from pg_tables where schemaname = $1 order by tablename`,
    [db.SCHEMA]
  );

  const salida = [];

  for (const { tablename } of tablas) {
    const columnas = await db.all(
      `select column_name, data_type, numeric_precision, numeric_scale, is_nullable
         from information_schema.columns
        where table_schema = $1 and table_name = $2
        order by ordinal_position`,
      [db.SCHEMA, tablename]
    );

    const pks = await db.all(
      `select kcu.column_name
         from information_schema.table_constraints tc
         join information_schema.key_column_usage kcu
           on kcu.constraint_name = tc.constraint_name
          and kcu.table_schema = tc.table_schema
        where tc.table_schema = $1 and tc.table_name = $2
          and tc.constraint_type = 'PRIMARY KEY'`,
      [db.SCHEMA, tablename]
    );
    const claves = new Set(pks.map(p => p.column_name));

    const relaciones = await db.all(
      `select kcu.column_name as columna,
              ccu.table_name  as tabla_ref,
              ccu.column_name as columna_ref
         from information_schema.table_constraints tc
         join information_schema.key_column_usage kcu
           on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
         join information_schema.constraint_column_usage ccu
           on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
        where tc.table_schema = $1 and tc.table_name = $2
          and tc.constraint_type = 'FOREIGN KEY'`,
      [db.SCHEMA, tablename]
    );

    const indices = await db.all(
      `select indexname from pg_indexes
        where schemaname = $1 and tablename = $2 and indexname like 'idx_%'
        order by indexname`,
      [db.SCHEMA, tablename]
    );

    const { n: filas } = await db.one(
      `select count(*)::int as n from ${db.SCHEMA}.${tablename}`
    );

    const rls = await db.one(
      `select c.relrowsecurity as activo
         from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
        where ns.nspname = $1 and c.relname = $2`,
      [db.SCHEMA, tablename]
    );

    salida.push({
      nombre: tablename,
      filas,
      rls: !!(rls && rls.activo),
      columnas: columnas.map(c => ({
        nombre: c.column_name,
        tipo: c.numeric_precision && c.data_type === 'numeric'
          ? `numeric(${c.numeric_precision},${c.numeric_scale})`
          : c.data_type,
        pk: claves.has(c.column_name),
        nulo: c.is_nullable === 'YES'
      })),
      indices: indices.map(i => i.indexname),
      relaciones: relaciones.map(r => ({
        columna: r.columna,
        referencia: `${r.tabla_ref}.${r.columna_ref}`
      }))
    });
  }

  const doc = {
    generado_at: new Date().toISOString(),
    motor: 'postgresql',
    proveedor: 'supabase',
    esquema: db.SCHEMA,
    tablas: salida
  };

  const outPath = path.join(__dirname, '..', 'docs', 'db-export.json');
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2));
  console.log(`Esquema exportado a ${outPath} (${salida.length} tablas).`);
}

exportar()
  .catch(e => { console.error('Fallo la exportacion:', e.message); process.exitCode = 1; })
  .finally(() => db.pool.end());
