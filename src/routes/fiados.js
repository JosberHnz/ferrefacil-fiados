const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { calcularMora, calcularSaldo } = require('../mora');

const router = express.Router();
router.use(requireAuth);

function enriquecer(fiado) {
  const totalPagado = db.prepare(
    'SELECT COALESCE(SUM(monto),0) AS total FROM pagos WHERE fiado_id = ?'
  ).get(fiado.id).total;

  return {
    ...fiado,
    total_pagado: totalPagado,
    saldo: calcularSaldo(fiado.monto, totalPagado),
    dias_mora: calcularMora(fiado.fecha_vencimiento, fiado.estado)
  };
}

// GET /api/fiados?cliente_id=1  -> lista de fiados (con mora calculada al vuelo)
router.get('/', (req, res) => {
  const { cliente_id } = req.query;
  const rows = cliente_id
    ? db.prepare('SELECT * FROM fiados WHERE cliente_id = ? ORDER BY fecha_vencimiento').all(cliente_id)
    : db.prepare('SELECT * FROM fiados ORDER BY fecha_vencimiento').all();

  res.json(rows.map(enriquecer));
});

router.post('/', (req, res) => {
  const { cliente_id, descripcion, monto, fecha_vencimiento, producto_id } = req.body || {};
  if (!cliente_id || !descripcion || !monto || !fecha_vencimiento) {
    return res.status(400).json({ error: 'cliente_id, descripcion, monto y fecha_vencimiento son requeridos' });
  }
  if (Number(monto) <= 0) return res.status(400).json({ error: 'monto debe ser mayor a 0' });

  const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(cliente_id);
  if (!cliente) return res.status(404).json({ error: 'cliente_id no existe' });

  const info = db.prepare(
    `INSERT INTO fiados (cliente_id, producto_id, descripcion, monto, fecha_vencimiento, creado_por)
     VALUES (?,?,?,?,?,?)`
  ).run(cliente_id, producto_id || null, descripcion, monto, fecha_vencimiento, req.usuario.id);

  const fiado = db.prepare('SELECT * FROM fiados WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(enriquecer(fiado));
});

// Registrar un pago (abono o pago total) y recalcular estado.
router.post('/:id/pagos', (req, res) => {
  const fiado = db.prepare('SELECT * FROM fiados WHERE id = ?').get(req.params.id);
  if (!fiado) return res.status(404).json({ error: 'Fiado no encontrado' });

  const { monto } = req.body || {};
  if (!monto || Number(monto) <= 0) return res.status(400).json({ error: 'monto de pago invalido' });

  db.prepare('INSERT INTO pagos (fiado_id, monto) VALUES (?,?)').run(fiado.id, monto);

  const totalPagado = db.prepare(
    'SELECT COALESCE(SUM(monto),0) AS total FROM pagos WHERE fiado_id = ?'
  ).get(fiado.id).total;

  const nuevoEstado = totalPagado >= fiado.monto ? 'pagado' : 'parcial';
  db.prepare('UPDATE fiados SET estado = ? WHERE id = ?').run(nuevoEstado, fiado.id);

  const actualizado = db.prepare('SELECT * FROM fiados WHERE id = ?').get(fiado.id);
  res.json(enriquecer(actualizado));
});

module.exports = router;
