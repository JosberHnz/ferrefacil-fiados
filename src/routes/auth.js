const express = require('express');
const { login, logout } = require('../auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email y password son requeridos' });
  }

  const result = login(email, password);
  if (!result) return res.status(401).json({ error: 'Credenciales invalidas' });

  res.cookie('session', result.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8 // 8 horas
  });
  res.json({ user: result.user });
});

router.post('/logout', (req, res) => {
  const token = req.cookies && req.cookies.session;
  if (token) logout(token);
  res.clearCookie('session');
  res.json({ ok: true });
});

module.exports = router;
