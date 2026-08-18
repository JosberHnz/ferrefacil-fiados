const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

function login(email, password) {
  const user = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  if (!user) return null;
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return null;

  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sesiones (usuario_id, token) VALUES (?,?)').run(user.id, token);
  return { token, user: { id: user.id, email: user.email, rol: user.rol } };
}

function logout(token) {
  db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
}

// Politica de acceso 1: toda ruta protegida exige una sesion valida en tabla `sesiones`.
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.session;
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  const sesion = db.prepare(
    `SELECT s.*, u.rol, u.email FROM sesiones s
     JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token = ?`
  ).get(token);

  if (!sesion) return res.status(401).json({ error: 'Sesion invalida o expirada' });

  req.usuario = { id: sesion.usuario_id, email: sesion.email, rol: sesion.rol };
  next();
}

// Politica de acceso 2: solo 'admin' puede borrar clientes o modificar montos ya pagados.
function requireAdmin(req, res, next) {
  if (!req.usuario || req.usuario.rol !== 'admin') {
    return res.status(403).json({ error: 'Requiere rol admin' });
  }
  next();
}

module.exports = { login, logout, requireAuth, requireAdmin };
