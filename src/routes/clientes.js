const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// Envuelve un handler async para que un rechazo llegue al manejador de
// errores de Express en vez de quedar como promesa no capturada.
const asyncHandler = fn => (req, res, next) => fn(req, res, next).catch(next);

// GET /api/clientes?buscar=texto
router.get('/', asyncHandler(async (req, res) => {
  const { buscar } = req.query;
  // ILIKE en vez de LIKE: la busqueda ahora no distingue mayusculas, y el
  // indice idx_clientes_nombre esta creado sobre lower(nombre).
  const rows = buscar
    ? await db.all('select * from clientes where nombre ilike $1 order by nombre', [`%${buscar}%`])
    : await db.all('select * from clientes order by nombre');
  res.json(rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const cliente = await db.one('select * from clientes where id = $1', [req.params.id]);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(cliente);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { nombre, telefono, direccion, limite_credito } = req.body || {};
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'nombre es requerido' });

  // RETURNING evita la segunda consulta que hacia falta con lastInsertRowid.
  const cliente = await db.one(
    `insert into clientes (nombre, telefono, direccion, limite_credito)
     values ($1, $2, $3, $4)
     returning *`,
    [nombre.trim(), telefono || null, direccion || null, Number(limite_credito) || 0]
  );

  res.status(201).json(cliente);
}));

// Politica de acceso: borrar clientes requiere rol admin.
router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const borrados = await db.run('delete from clientes where id = $1', [req.params.id]);
  if (borrados === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json({ ok: true });
}));

module.exports = router;
