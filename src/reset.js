// Borra TODOS los datos y vuelve a aplicar el esquema.
// Uso: npm run db:reset
//
// Destructivo a proposito: sirve para recargar la demo desde cero. Se niega a
// correr si NODE_ENV es production, para no vaciar la base real por un
// comando escrito de mas.
require('dotenv').config({ quiet: true });
const db = require('./db');

async function reset() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('db:reset esta bloqueado con NODE_ENV=production.');
  }

  // CASCADE limpia tambien las tablas dependientes; RESTART IDENTITY
  // devuelve los contadores de id a 1 para que la demo salga numerada limpia.
  await db.query(`
    truncate table pagos, fiados, sesiones, clientes, productos, usuarios
    restart identity cascade`);

  console.log(`Tablas vaciadas en "${db.SCHEMA}". Ejecuta "npm run seed" para recargar la demo.`);
}

reset()
  .catch(e => { console.error('Fallo el reset:', e.message); process.exitCode = 1; })
  .finally(() => db.pool.end());
