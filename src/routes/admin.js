const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

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

// Marcar un ticket como resuelto, con un diagnostico opcional escrito
// (aqui es donde "Hermes" u otra revision, humana o automatica, deja su
// conclusion sobre la causa del error).
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

// Lista de feedback recibido de los usuarios.
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

// Dashboard: numeros generales del negocio, solo para admin/super_admin.
router.get('/stats', async (req, res, next) => {
  try {
    const [clientes, fiados, tickets, feedback] = await Promise.all([
      db.one('select count(*)::int as n from clientes'),
      db.all(`
        select estado, count(*)::int as n, coalesce(sum(monto),0)::float as total
          from fiados group by estado`),
      db.one(`select count(*)::int as n from tickets_error where estado = 'abierto'`),
      db.one('select count(*)::int as n from feedback')
    ]);

    res.json({
      total_clientes: clientes.n,
      fiados_por_estado: fiados,
      tickets_abiertos: tickets.n,
      total_feedback: feedback.n
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;