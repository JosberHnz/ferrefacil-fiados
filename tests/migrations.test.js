require('dotenv').config({ quiet: true });

// Esquema propio, para no chocar con el de api.test.js.
process.env.DB_SCHEMA = 'test_migraciones';

const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const DIR = path.join(__dirname, '..', 'migrations');
const SCHEMA = process.env.DB_SCHEMA;
const archivos = fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();

beforeAll(async () => {
  await db.query(`drop schema if exists ${SCHEMA} cascade`);
  await db.query(`create schema ${SCHEMA}`);
}, 60000);

afterAll(async () => {
  await db.query(`drop schema if exists ${SCHEMA} cascade`);
  await db.pool.end();
}, 60000);

describe('numeracion de las migraciones', () => {
  test('hay al menos una migracion', () => {
    expect(archivos.length).toBeGreaterThan(0);
  });

  test('todas llevan prefijo de tres digitos', () => {
    archivos.forEach(f => expect(f).toMatch(/^\d{3}_[a-z0-9_]+\.sql$/));
  });

  test('la secuencia es canonica: 001, 002, 003... sin huecos ni repetidos', () => {
    const numeros = archivos.map(f => parseInt(f.slice(0, 3), 10));
    expect(numeros).toEqual(numeros.map((_, i) => i + 1));
  });

  test('cada migracion registra su propia version', () => {
    archivos.forEach(f => {
      const sql = fs.readFileSync(path.join(DIR, f), 'utf8');
      expect(sql).toContain(`values ('${f.slice(0, 3)}'`);
      expect(sql).toContain('on conflict (version) do nothing');
    });
  });
});

describe('idempotencia de las migraciones', () => {
  /** Estructura + conteos, para comparar antes y despues de repetir. */
  async function foto() {
    const estructura = await db.all(
      `select table_name, column_name, data_type, is_nullable
         from information_schema.columns where table_schema = $1
        order by table_name, column_name`, [SCHEMA]);

    const tablas = await db.all(
      `select table_name from information_schema.tables
        where table_schema = $1 and table_type = 'BASE TABLE'
        order by table_name`, [SCHEMA]);

    const conteos = {};
    for (const { table_name } of tablas) {
      const { n } = await db.one(`select count(*)::int as n from ${SCHEMA}.${table_name}`);
      conteos[table_name] = n;
    }
    return { estructura, conteos };
  }

  // Cada archivo se aplica, se fotografia, se vuelve a aplicar y se compara.
  // Se hacen en orden dentro de un mismo describe porque cada migracion
  // depende de la anterior.
  test.each(archivos)('%s se puede aplicar dos veces sin efectos', async archivo => {
    const sql = fs.readFileSync(path.join(DIR, archivo), 'utf8');

    await db.query(sql);
    const antes = await foto();

    await db.query(sql); // repetir no debe fallar...
    const despues = await foto();

    expect(despues.estructura).toEqual(antes.estructura); // ...ni alterar el esquema
    expect(despues.conteos).toEqual(antes.conteos);       // ...ni duplicar filas
  }, 60000);

  test('quedan registradas todas las versiones', async () => {
    const filas = await db.all('select version from schema_migrations order by version');
    expect(filas.map(f => f.version)).toEqual(archivos.map(f => f.slice(0, 3)));
  });

  test('RLS queda activo en todas las tablas de datos', async () => {
    const sinRls = await db.all(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = $1 and c.relkind = 'r'
          and c.relname <> 'schema_migrations' and not c.relrowsecurity`, [SCHEMA]);
    // Sin RLS, la clave anon publica de Supabase leeria toda la cartera.
    expect(sinRls.map(r => r.relname)).toEqual([]);
  });
});
