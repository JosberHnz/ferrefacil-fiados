const express = require('express');
const { login, logout, DURACION_SESION_HORAS } = require('../auth');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email y password son requeridos' });
    }

    const result = await login(email, password);
    if (!result) return res.status(401).json({ error: 'Credenciales invalidas' });

    res.cookie('session', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * DURACION_SESION_HORAS
    });
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

module.exports = router;
