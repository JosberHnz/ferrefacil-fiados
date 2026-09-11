const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.post('/', async (req, res, next) => {
  try {
    const { mensaje } = req.body || {};
    if (!mensaje?.trim()) {
      return res.status(400).json({ error: 'El mensaje es requerido' });
    }
    const fila = await db.one(
      `insert into feedback (usuario_id, mensaje) values ($1, $2) returning *`,
      [req.usuario.id, mensaje.trim().slice(0, 2000)]
    );
    res.status(201).json(fila);
  } catch (e) {
    next(e);
  }
});

module.exports = router;