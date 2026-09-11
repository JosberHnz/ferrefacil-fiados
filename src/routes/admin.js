const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { calcularMora } = require('../mora');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// Lista de tickets de error, mas recientes primero.
router.get('/tickets', async (req, res, next) => {
  try {
    const rows = await db.all(
      `select t.*, u.email as usuario_email
         from tickets_error t
         left join usuarios u on u.id = t.usuario_id
        order by t.creado_en desc
        limit 100`
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.patch('/tickets/:id', async (req, res, next) => {
  try {
    const { estado, diagnostico } = req.body || {};
    if (!['abierto', 'en_revision', 'resuelto'].includes(estado)) {
      return res.status(400).json({ error: 'Estado invalido' });
    }
    const fila = await db.one(
      `update tickets_error
          set estado = $1, diagnostico = $2,
              resuelto_en = case when $1 = 'resuelto' then now() else resuelto_en end
        where id = $3
        returning *`,
      [estado, diagnostico || null, req.params.id]
    );
    if (!fila) return res.status(404).json({ error: 'Ticket no encontrado' });
    res.json(fila);
  } catch (e) {
    next(e);
  }
});

router.get('/feedback', async (req, res, next) => {
  try {
    const rows = await db.all(
      `select f.*, u.email as usuario_email
         from feedback f
         join usuarios u on u.id = f.usuario_id
        order by f.creado_en desc
        limit 100`
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Dashboard: numeros generales del negocio, top deudores, mora promedio y
// actividad reciente. Todo en una sola llamada para que el panel cargue de
// una vez, en vez de disparar 5 peticiones separadas al abrir la pestana.
router.get('/stats', async (req, res, next) => {
  try {
    const [clientes, fiados, tickets, feedback, topDeudores, pendientes, actividad] = await Promise.all([
      db.one('select count(*)::int as n from clientes'),

      db.all(`select estado, count(*)::int as n, coalesce(sum(monto),0)::float as total
                from fiados group by estado`),

      db.one(`select count(*)::int as n from tickets_error where estado = 'abierto'`),

      db.one('select count(*)::int as n from feedback'),

      // Top 5 clientes con mas deuda pendiente. Se calcula el saldo por
      // fiado primero (monto menos sus pagos) para no inflar la suma si un
      // fiado tiene varios abonos parciales.
      db.all(`
        with saldo_por_fiado as (
          select f.id, f.cliente_id,
                 f.monto - coalesce((select sum(p.monto) from pagos p where p.fiado_id = f.id), 0) as saldo
            from fiados f
           where f.estado <> 'pagado'
        )
        select c.nombre, sum(sf.saldo)::float as deuda
          from saldo_por_fiado sf
          join clientes c on c.id = sf.cliente_id
         group by c.id, c.nombre
         order by deuda desc
         limit 5
      `),

      // Fiados no pagados: se traen crudos para calcular la mora en JS con
      // la misma funcion que usa el resto de la app (mora.js), en vez de
      // reescribir esa logica en SQL y arriesgar que se desincronicen.
      db.all(`select fecha_vencimiento, estado from fiados where estado <> 'pagado'`),

      // Actividad reciente: ultimos fiados creados y pagos registrados,
      // mezclados y ordenados por fecha, para dar una idea de "que paso
      // hoy" sin tener que ver dos pestanas distintas.
      db.all(`
        select * from (
          select 'fiado' as tipo, f.creado_en as fecha, c.nombre as cliente,
                 f.descripcion as detalle, f.monto as monto
            from fiados f join clientes c on c.id = f.cliente_id
          union all
          select 'pago' as tipo, p.creado_en as fecha, c.nombre as cliente,
                 f.descripcion as detalle, p.monto as monto
            from pagos p
            join fiados f on f.id = p.fiado_id
            join clientes c on c.id = f.cliente_id
        ) t
        order by fecha desc
        limit 5
      `)
    ]);

    const diasMora = pendientes.map(f => calcularMora(f.fecha_vencimiento, f.estado)).filter(d => d > 0);
    const moraPromedio = diasMora.length
      ? Math.round(diasMora.reduce((a, b) => a + b, 0) / diasMora.length)
      : 0;
    const moraCritica = diasMora.filter(d => d > 15).length;

    res.json({
      total_clientes: clientes.n,
      fiados_por_estado: fiados,
      tickets_abiertos: tickets.n,
      total_feedback: feedback.n,
      top_deudores: topDeudores,
      mora_promedio_dias: moraPromedio,
      mora_critica_count: moraCritica,
      actividad_reciente: actividad
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;