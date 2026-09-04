// Cacheo del lado del servidor y cabeceras HTTP de cache.
//
// Hay tres capas y cada una resuelve un problema distinto:
//
//   1. memo()          evita ir a la base por datos que cambian poco. La
//                      vitrina publica la pide cada visitante de la landing;
//                      sin cache, cada visita eran dos consultas a Supabase.
//   2. cabeceras       le dicen al navegador cuanto puede reutilizar una
//                      respuesta sin volver a preguntar.
//   3. ETag            cuando si pregunta, permite responder 304 sin cuerpo
//                      si nada cambio. Express ya calcula el ETag; aqui solo
//                      se ajusta el Cache-Control para que lo revalide.
const TTL_POR_DEFECTO_MS = 30000;

const almacen = new Map();

/**
 * Envuelve una funcion async y memoriza su resultado durante ttlMs.
 * Las llamadas concurrentes comparten la misma promesa, de modo que diez
 * visitas simultaneas producen una sola consulta y no diez.
 */
function memo(clave, fn, ttlMs = TTL_POR_DEFECTO_MS) {
  const ahora = Date.now();
  const guardado = almacen.get(clave);

  if (guardado && guardado.expira > ahora) return guardado.promesa;

  const promesa = Promise.resolve()
    .then(fn)
    // Un fallo no debe quedar cacheado: se descarta para que el siguiente
    // intento vuelva a la base.
    .catch(e => { almacen.delete(clave); throw e; });

  almacen.set(clave, { promesa, expira: ahora + ttlMs });
  return promesa;
}

/** Invalida una clave concreta, o todas si no se pasa ninguna. */
function invalidar(clave) {
  if (clave === undefined) almacen.clear();
  else almacen.delete(clave);
}

function estado() {
  return { entradas: almacen.size, claves: [...almacen.keys()] };
}

/**
 * Cabeceras para respuestas publicas y compartibles (la vitrina).
 * s-maxage deja que el CDN de Vercel las sirva sin despertar la funcion;
 * stale-while-revalidate permite entregar la copia vieja mientras se
 * refresca por detras, asi el visitante nunca espera.
 */
function cachePublica(segundos = 30) {
  return (req, res, next) => {
    res.set('Cache-Control',
      `public, max-age=${segundos}, s-maxage=${segundos}, stale-while-revalidate=${segundos * 4}`);
    next();
  };
}

/**
 * Cabeceras para respuestas con datos de un usuario autenticado.
 *
 * no-store NO: impediria incluso el 304 y obligaria a descargar todo cada
 * vez. private + must-revalidate deja que el navegador guarde una copia
 * pero le obliga a confirmarla con el ETag antes de usarla, de modo que
 * nadie ve saldos desactualizados y las respuestas no viajan enteras si
 * nada cambio. "private" impide que un intermediario compartido la guarde.
 */
function cachePrivada() {
  return (req, res, next) => {
    res.set('Cache-Control', 'private, no-cache, must-revalidate');
    next();
  };
}

/** Las escrituras nunca se cachean, ni por error. */
function sinCache(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

module.exports = { memo, invalidar, estado, cachePublica, cachePrivada, sinCache, TTL_POR_DEFECTO_MS };
