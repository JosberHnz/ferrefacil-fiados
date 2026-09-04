const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { calcularMora, calcularSaldo } = require('../mora');

const router = express.Router();
router.use(requireAuth);

const asyncHandler = fn => (req, res, next) => fn(req, res, next).catch(next);

// El total pagado se resuelve dentro de la propia consulta. Antes se hacia un
// SELECT SUM por cada fiado del listado (N+1): 20 fiados eran 21 consultas.
const SELECT_FIADOS = `
  select f.*,
         coalesce((select sum(p.monto) from pagos p where p.fiado_id = f.id), 0) as total_pagado
    from fiados f`;

/** Anade saldo y dias de mora. Logica pura: no toca la base. */
function enriquecer(fiado) {
  return {
    ...fiado,
    total_pagado: fiado.total_pagado,
    saldo: calcularSaldo(fiado.monto, fiado.total_pagado),
    dias_mora: calcularMora(fiado.fecha_vencimiento, fiado.estado)
  };
}

// GET /api/fiados?cliente_id=1
router.get('/', asyncHandler(async (req, res) => {
  const { cliente_id } = req.query;
  const rows = cliente_id
    ? await db.all(`${SELECT_FIADOS} where f.cliente_id = $1 order by f.fecha_vencimiento`, [cliente_id])
    : await db.all(`${SELECT_FIADOS} order by f.fecha_vencimiento`);

  res.json(rows.map(enriquecer));
}));

router.post('/', asyncHandler(async (req, res) => {
  const { cliente_id, descripcion, monto, fecha_vencimiento, producto_id } = req.body || {};
  if (!cliente_id || !descripcion || !monto || !fecha_vencimiento) {
    return res.status(400).json({ error: 'cliente_id, descripcion, monto y fecha_vencimiento son requeridos' });
  }
  if (Number(monto) <= 0) return res.status(400).json({ error: 'monto debe ser mayor a 0' });

  const cliente = await db.one('select id from clientes where id = $1', [cliente_id]);
  if (!cliente) return res.status(404).json({ error: 'cliente_id no existe' });

  const creado = await db.one(
    `insert into fiados (cliente_id, producto_id, descripcion, monto, fecha_vencimiento, creado_por)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [cliente_id, producto_id || null, descripcion, monto, fecha_vencimiento, req.usuario.id]
  );

  res.status(201).json(enriquecer({ ...creado, total_pagado: 0 }));
}));

// Registrar un pago (abono o pago total) y recalcular estado.
router.post('/:id/pagos', asyncHandler(async (req, res) => {
  const { monto } = req.body || {};
  if (!monto || Number(monto) <= 0) return res.status(400).json({ error: 'monto de pago invalido' });

  const existe = await db.one('select id from fiados where id = $1', [req.params.id]);
  if (!existe) return res.status(404).json({ error: 'Fiado no encontrado' });

  // En transaccion: insertar el pago, recalcular el total y fijar el estado
  // tienen que ser atomicos. Con dos abonos simultaneos, leer el total fuera
  // de la transaccion podia dejar el fiado en 'parcial' ya estando saldado.
  const actualizado = await db.tx(async client => {
    await client.query(
      'insert into pagos (fiado_id, monto) values ($1, $2)',
      [req.params.id, monto]
    );

    // FOR UPDATE bloquea la fila hasta el commit.
    const { rows: [fiado] } = await client.query(
      'select * from fiados where id = $1 for update',
      [req.params.id]
    );

    const { rows: [{ total }] } = await client.query(
      'select coalesce(sum(monto), 0) as total from pagos where fiado_id = $1',
      [req.params.id]
    );

    const nuevoEstado = Number(total) >= Number(fiado.monto) ? 'pagado' : 'parcial';

    const { rows: [fila] } = await client.query(
      'update fiados set estado = $1 where id = $2 returning *',
      [nuevoEstado, req.params.id]
    );

    return { ...fila, total_pagado: Number(total) };
  });

  res.json(enriquecer(actualizado));
}));

module.exports = router;
