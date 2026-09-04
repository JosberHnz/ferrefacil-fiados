// Capa de acceso a PostgreSQL (Supabase).
//
// Sustituye al node:sqlite sincrono anterior. A diferencia de aquel, este
// modulo no tiene efectos secundarios al importarse: no crea tablas ni
// inserta usuarios. El esquema se aplica con `npm run db:migrate` y los
// datos demo con `npm run seed`, que es lo que permite que los tests
// controlen contra que base corren.
const { Pool, types } = require('pg');

// --- Conversion de tipos ---
// Por defecto pg entrega numeric como string ("850.00"), para no perder
// precision en valores enormes. Aqui los montos son dinero de ferreteria y
// la API siempre devolvio numeros, asi que se convierten: sin esto,
// res.body.saldo pasaria de 500 a "500.00" y el frontend concatenaria
// cadenas en vez de sumar.
types.setTypeParser(types.builtins.NUMERIC, parseFloat);

// Y date lo entrega como objeto Date a medianoche LOCAL, lo que desplaza el
// dia segun la zona horaria del servidor. mora.js trabaja con 'YYYY-MM-DD',
// asi que se deja la cadena cruda tal como la envia PostgreSQL.
types.setTypeParser(types.builtins.DATE, v => v);

// Los id son bigint y pg los entrega como string, otra vez por precision.
// Con SQLite eran numeros, asi que sin esto la API devolveria {"id":"7"} y
// cualquier comparacion estricta con un numero en el frontend fallaria.
// Un id de esta aplicacion no se acerca ni de lejos a 2^53.
types.setTypeParser(types.builtins.INT8, v => parseInt(v, 10));

if (!process.env.DATABASE_URL) {
  throw new Error(
    'Falta DATABASE_URL. En local se define en .env; en Vercel, en las ' +
    'variables de entorno del proyecto.'
  );
}

// Esquema aislado para los tests, para no tocar los datos reales.
const SCHEMA = process.env.DB_SCHEMA || 'public';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // El search_path se fija como parametro de arranque de la conexion. Hacerlo
  // en el evento 'connect' con client.query() provoca una carrera: la consulta
  // real puede empezar antes de que el SET termine.
  options: `-c search_path=${SCHEMA}`,
  // Supabase presenta un certificado propio; se cifra igual, no se valida
  // la cadena. Es lo que hace el cliente oficial contra el pooler.
  ssl: { rejectUnauthorized: false },
  // El transaction pooler de Supabase ya multiplexa del lado del servidor.
  // Abrir mas de una conexion por instancia serverless solo gasta cupo del
  // proyecto sin ganar concurrencia.
  max: Number(process.env.PG_POOL_MAX || 1),
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000
});

// Un pool huerfano no debe tumbar el proceso.
pool.on('error', err => {
  console.error('Error inesperado en el pool de PostgreSQL:', err.message);
});

/** Ejecuta una consulta y devuelve el resultado completo de pg. */
function query(text, params) {
  return pool.query(text, params);
}

/** Primera fila, o null si no hay ninguna. Equivale al .get() de SQLite. */
async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}

/** Todas las filas. Equivale al .all() de SQLite. */
async function all(text, params) {
  const { rows } = await pool.query(text, params);
  return rows;
}

/** Filas afectadas. Equivale al .changes de SQLite. */
async function run(text, params) {
  const { rowCount } = await pool.query(text, params);
  return rowCount;
}

/**
 * Ejecuta varias consultas en una transaccion. El callback recibe el cliente;
 * si lanza, se hace rollback.
 */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const resultado = await fn(client);
    await client.query('commit');
    return resultado;
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, one, all, run, tx, SCHEMA };
