const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

const DURACION_SESION_HORAS = 8;

/** Crea una sesion para un usuario ya verificado y devuelve su token. */
async function crearSesion(usuario) {
  const token = crypto.randomBytes(24).toString('hex');
  await db.run(
    `insert into sesiones (usuario_id, token, expira_en)
     values ($1, $2, now() + ($3 || ' hours')::interval)`,
    [usuario.id, token, String(DURACION_SESION_HORAS)]
  );
  return { token, user: { id: usuario.id, email: usuario.email, rol: usuario.rol } };
}

async function login(email, password) {
  const user = await db.one('select * from usuarios where email = $1', [email]);
  if (!user) return null;

  // Las cuentas creadas por Google no tienen contrasena local.
  if (!user.password_hash) return null;

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return null;

  return crearSesion(user);
}

async function logout(token) {
  await db.run('delete from sesiones where token = $1', [token]);
}

// Politica de acceso 1: toda ruta protegida exige una sesion valida en tabla
// `sesiones`. Ahora ademas se comprueba que no haya expirado: antes la cookie
// caducaba a las 8 horas pero la fila del servidor vivia para siempre.
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies && req.cookies.session;
    if (!token) return res.status(401).json({ error: 'No autenticado' });

    const sesion = await db.one(
      `select s.usuario_id, u.rol, u.email
         from sesiones s
         join usuarios u on u.id = s.usuario_id
        where s.token = $1 and s.expira_en > now()`,
      [token]
    );

    if (!sesion) return res.status(401).json({ error: 'Sesion invalida o expirada' });

    req.usuario = { id: sesion.usuario_id, email: sesion.email, rol: sesion.rol };
    next();
  } catch (e) {
    next(e);
  }
}

// Politica de acceso 2: solo 'admin' puede borrar clientes.
function requireAdmin(req, res, next) {
  if (!req.usuario || req.usuario.rol !== 'admin') {
    return res.status(403).json({ error: 'Requiere rol admin' });
  }
  next();
}

module.exports = { login, logout, requireAuth, requireAdmin, crearSesion, DURACION_SESION_HORAS };
