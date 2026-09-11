const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { idempotente } = require('../idempotencia');
const cache = require('../cache');
const { calcularMora, calcularSaldo } = require('../mora');

const router = express.Router();
router.use(requireAuth);

const asyncHandler = fn => (req, res, next) => fn(req, res, next).catch(next);

// El total pagado se resuelve dentro de la propia consulta. Antes se hacia un
// SELECT SUM por cada fiado del listado (N+1): 20 fiados eran 21 consultas.
// Se incluye el nombre del cliente via JOIN para poder filtrar por el en
// "buscar" sin una consulta aparte por cada fiado.
const SELECT_FIADOS = `
  select f.*, c.nombre as cliente_nombre,
         coalesce((select sum(p.monto) from pagos p where p.fiado_id = f.id), 0) as total_pagado
    from fiados f
    join clientes c on c.id = f.cliente_id`;

/** Anade saldo y dias de mora. Logica pura: no toca la base. */
function enriquecer(fiado) {
  return {
    ...fiado,
    total_pagado: fiado.total_pagado,
    saldo: calcularSaldo(fiado.monto, fiado.total_pagado),
    dias_mora: calcularMora(fiado.fecha_vencimiento, fiado.estado)
  };
}

// GET /api/fiados?cliente_id=1&estado=pendiente&buscar=cemento
// Los 3 filtros son opcionales y se combinan con AND. "buscar" compara
// contra el nombre del cliente Y la descripcion del fiado, para que una
// sola caja de busqueda sirva para ambos casos de uso.
router.get('/', cache.cachePrivada(), asyncHandler(async (req, res) => {
  const { cliente_id, estado, buscar } = req.query;
  const condiciones = [];
  const params = [];

  if (cliente_id) {
    params.push(cliente_id);
    condiciones.push(`f.cliente_id = $${params.length}`);
  }
  if (estado) {
    params.push(estado);
    condiciones.push(`f.estado = $${params.length}`);
  }
  if (buscar) {
    params.push(`%${buscar}%`);
    condiciones.push(`(c.nombre ilike $${params.length} or f.descripcion ilike $${params.length})`);
  }

  const where = condiciones.length ? `where ${condiciones.join(' and ')}` : '';
  const rows = await db.all(`${SELECT_FIADOS} ${where} order by f.fecha_vencimiento`, params);

  res.json(rows.map(enriquecer));
}));

router.post('/', cache.sinCache, idempotente, asyncHandler(async (req, res) => {
  const { cliente_id, descripcion, monto, fecha_vencimiento, producto_id } = req.body || {};
  if (!cliente_id || !descripcion || !monto || !fecha_vencimiento) {
    return res.status(400).json({ error: 'cliente_id, descripcion, monto y fecha_vencimiento son requeridos' });
  }
  if (Number(monto) <= 0) return res.status(400).json({ error: 'monto debe ser mayor a 0' });

  const cliente = await db.one('select id, nombre from clientes where id = $1', [cliente_id]);
  if (!cliente) return res.status(404).json({ error: 'cliente_id no existe' });

  const creado = await db.one(
    `insert into fiados (cliente_id, producto_id, descripcion, monto, fecha_vencimiento, creado_por)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [cliente_id, producto_id || null, descripcion, monto, fecha_vencimiento, req.usuario.id]
  );

  cache.invalidar('vitrina');
  res.status(201).json(enriquecer({ ...creado, cliente_nombre: cliente.nombre, total_pagado: 0 }));
}));

// Registrar un pago (abono o pago total) y recalcular estado.
router.post('/:id/pagos', cache.sinCache, idempotente, asyncHandler(async (req, res) => {
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

    const { rows: [{ nombre: clienteNombre }] } = await client.query(
      'select nombre from clientes where id = $1', [fiado.cliente_id]
    );

    const nuevoEstado = Number(total) >= Number(fiado.monto) ? 'pagado' : 'parcial';

    const { rows: [fila] } = await client.query(
      'update fiados set estado = $1 where id = $2 returning *',
      [nuevoEstado, req.params.id]
    );

    return { ...fila, cliente_nombre: clienteNombre, total_pagado: Number(total) };
  });

  cache.invalidar('vitrina');
  res.json(enriquecer(actualizado));
}));

module.exports = router;