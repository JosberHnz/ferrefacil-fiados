const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/clientes?buscar=texto  -> busqueda por nombre (indice idx_clientes_nombre)
router.get('/', (req, res) => {
  const { buscar } = req.query;
  const rows = buscar
    ? db.prepare('SELECT * FROM clientes WHERE nombre LIKE ? ORDER BY nombre').all(`%${buscar}%`)
    : db.prepare('SELECT * FROM clientes ORDER BY nombre').all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(cliente);
});

router.post('/', (req, res) => {
  const { nombre, telefono, direccion, limite_credito } = req.body || {};
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'nombre es requerido' });

  const info = db.prepare(
    'INSERT INTO clientes (nombre, telefono, direccion, limite_credito) VALUES (?,?,?,?)'
  ).run(nombre.trim(), telefono || null, direccion || null, Number(limite_credito) || 0);

  res.status(201).json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(info.lastInsertRowid));
});

// Politica de acceso: borrar clientes requiere rol admin.
router.delete('/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json({ ok: true });
});

module.exports = router;
