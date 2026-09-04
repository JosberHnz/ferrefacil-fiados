const express = require('express');
const { login, logout, crearSesion, DURACION_SESION_HORAS } = require('../auth');
const db = require('../db');
const google = require('../oauth-google');

const router = express.Router();

const COOKIE_VERIFIER = 'g_verifier';

function ponerCookieSesion(res, token) {
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * DURACION_SESION_HORAS
  });
}

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email y password son requeridos' });
    }

    const result = await login(email, password);
    if (!result) return res.status(401).json({ error: 'Credenciales invalidas' });

    ponerCookieSesion(res, result.token);
    res.json({ user: result.user });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies && req.cookies.session;
    if (token) await logout(token);
    res.clearCookie('session');
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// Inicio de sesion con Google (via Supabase Auth)
// ---------------------------------------------------------------------------

/** Indica al frontend si conviene mostrar el boton de Google. */
router.get('/google/disponible', (req, res) => {
  res.json({ disponible: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) });
});

// Paso 1: se manda al usuario a Google.
router.get('/google', (req, res, next) => {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return res.status(503).json({ error: 'Inicio de sesion con Google no configurado' });
    }

    const verifier = google.crearVerifier();

    // El verifier viaja en cookie httpOnly y de vida corta: solo tiene que
    // sobrevivir el ida y vuelta a Google.
    res.cookie(COOKIE_VERIFIER, verifier, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 10
    });

    res.redirect(google.urlAutorizacion(req, verifier));
  } catch (e) {
    next(e);
  }
});

// Paso 2: Google devuelve al usuario aqui con ?code=
router.get('/callback', async (req, res, next) => {
  const alError = motivo => res.redirect('/app?error=' + encodeURIComponent(motivo));

  try {
    const { code } = req.query;
    const verifier = req.cookies && req.cookies[COOKIE_VERIFIER];
    res.clearCookie(COOKIE_VERIFIER);

    if (!code) return alError('Google no devolvio un codigo');
    if (!verifier) return alError('La sesion de inicio expiro, intenta de nuevo');

    const perfil = await google.canjearCodigo(code, verifier);

    let usuario = await db.one('select * from usuarios where email = $1', [perfil.email]);

    if (usuario) {
      // Cuenta ya existente: se vincula con Google sin tocar su rol.
      await db.run(
        `update usuarios
            set google_id = coalesce(google_id, $1),
                nombre = coalesce(nombre, $2),
                avatar_url = $3
          where id = $4`,
        [perfil.google_id, perfil.nombre, perfil.avatar_url, usuario.id]
      );
    } else if (google.permitido(perfil.email)) {
      // Alta nueva, solo si esta en la lista de permitidos.
      usuario = await db.one(
        `insert into usuarios (email, rol, google_id, nombre, avatar_url)
         values ($1, 'vendedor', $2, $3, $4)
         returning *`,
        [perfil.email, perfil.google_id, perfil.nombre, perfil.avatar_url]
      );
    } else {
      // Por defecto Google no da de alta a nadie: sin esto, cualquier cuenta
      // de Google del mundo veria la cartera completa de la ferreteria.
      return alError('Esa cuenta de Google no tiene acceso a esta aplicacion');
    }

    const sesion = await crearSesion(usuario);
    ponerCookieSesion(res, sesion.token);
    res.redirect('/app');
  } catch (e) {
    console.error('Fallo el callback de Google:', e.message);
    alError('No se pudo completar el inicio de sesion con Google');
  }
});

module.exports = router;
