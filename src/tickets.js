// Convierte cada error real del servidor en un ticket guardado en la base.
// Se llama desde el manejador de errores global de src/app.js.
//
// Es "fire and forget" a proposito: si guardar el ticket fallara (por
// ejemplo, la propia base de datos caida), no debe impedir que el cliente
// reciba su respuesta de error. Un ticket perdido es mejor que una peticion
// colgada.
const db = require('./db');

async function registrarError({ mensaje, ruta, metodo, usuarioId }) {
  try {
    await db.run(
      `insert into tickets_error (mensaje, ruta, metodo, usuario_id)
       values ($1, $2, $3, $4)`,
      [String(mensaje).slice(0, 2000), ruta || null, metodo || null, usuarioId || null]
    );
  } catch (e) {
    console.error('No se pudo registrar el ticket de error:', e.message);
  }
}

module.exports = { registrarError };