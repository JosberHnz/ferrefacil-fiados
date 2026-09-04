// Middleware de idempotencia para las rutas de escritura.
//
// Garantiza que una operacion identificada con la misma Idempotency-Key se
// aplique UNA sola vez, sin importar cuantas veces llegue. Tres clics en
// "Abonar" registran un pago, no tres.
//
// Se apoya en la tabla `idempotencia` (migracion 005). El flujo es:
//
//   1. Se intenta "reservar" la clave con un INSERT. Como la clave es
//      primary key, la reserva es atomica: si dos peticiones simultaneas
//      compiten, solo una gana.
//   2. Si la reserva funciona, se ejecuta la operacion y se guarda su
//      respuesta.
//   3. Si la clave ya existia con respuesta, se devuelve esa respuesta tal
//      cual, sin tocar la base.
//   4. Si existia sin respuesta, la original sigue en curso: se responde
//      409 para que el cliente no duplique nada.
const crypto = require('crypto');
const db = require('./db');

const HORAS_VIGENCIA = 24;

function huellaDe(body) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(body === undefined ? null : body))
    .digest('hex');
}

/**
 * Purga claves viejas de vez en cuando (1 de cada 50 peticiones), para no
 * pagar el coste en todas ni dejar la tabla creciendo sin limite.
 */
function purgarDeVezEnCuando() {
  if (Math.random() > 0.02) return;
  db.run(`delete from idempotencia where creado_en < now() - ($1 || ' hours')::interval`,
    [String(HORAS_VIGENCIA)])
    .catch(e => console.error('No se pudieron purgar claves de idempotencia:', e.message));
}

function idempotente(req, res, next) {
  const clave = req.get('Idempotency-Key');

  // Sin cabecera se procesa normal: la API sigue sirviendo a clientes que
  // no la manden (curl, el docente probando, integraciones futuras).
  if (!clave) return next();

  if (clave.length > 200) {
    return res.status(400).json({ error: 'Idempotency-Key demasiado larga' });
  }

  const huella = huellaDe(req.body);
  const usuarioId = req.usuario ? req.usuario.id : null;

  (async () => {
    // 1. Reserva atomica de la clave.
    const reservada = await db.run(
      `insert into idempotencia (clave, usuario_id, metodo, ruta, huella)
       values ($1, $2, $3, $4, $5)
       on conflict (clave) do nothing`,
      [clave, usuarioId, req.method, req.originalUrl, huella]
    );

    if (reservada === 0) {
      const previa = await db.one('select * from idempotencia where clave = $1', [clave]);

      // La misma clave con otro cuerpo no es un reintento: es un error del
      // cliente que estaria ocultando una operacion distinta.
      if (previa && previa.huella !== huella) {
        return res.status(409).json({
          error: 'Esa Idempotency-Key ya se uso para una operacion distinta'
        });
      }

      if (previa && previa.estado_http !== null) {
        // Reintento de algo ya resuelto: se repite la respuesta original.
        res.set('Idempotent-Replay', 'true');
        return res.status(previa.estado_http).json(previa.respuesta);
      }

      return res.status(409).json({
        error: 'La operacion ya se esta procesando, espera un momento'
      });
    }

    // 2. Se intercepta res.json para guardar la respuesta antes de enviarla.
    const jsonOriginal = res.json.bind(res);
    res.json = cuerpo => {
      const guardar = res.statusCode >= 200 && res.statusCode < 300
        ? db.run('update idempotencia set estado_http = $1, respuesta = $2 where clave = $3',
                 [res.statusCode, JSON.stringify(cuerpo), clave])
        // Si la operacion fallo, se libera la clave: el usuario debe poder
        // corregir los datos y reintentar con la misma.
        : db.run('delete from idempotencia where clave = $1', [clave]);

      guardar
        .catch(e => console.error('No se pudo registrar la idempotencia:', e.message))
        .finally(() => jsonOriginal(cuerpo));
      return res;
    };

    purgarDeVezEnCuando();
    next();
  })().catch(next);
}

module.exports = { idempotente, huellaDe, HORAS_VIGENCIA };
