const express = require('express');
const db = require('../db');
const { calcularMora, calcularSaldo } = require('../mora');

const router = express.Router();

/**
 * Convierte "Carlos Martinez" en "Carlos M.".
 *
 * Esta ruta NO pide sesion: alimenta la maqueta de la landing, que es una
 * pagina publica. Mostrar ahi el apellido completo de alguien junto a lo que
 * debe seria exponer la cartera de la ferreteria a cualquiera que entre.
 * Para nombres completos, devolver `nombre` tal cual.
 */
function abreviar(nombre) {
  const partes = String(nombre).trim().split(/\s+/);
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[1][0].toUpperCase()}.`;
}

// GET /api/publico/vitrina -> hasta 3 fiados de muestra, con mora al dia.
router.get('/vitrina', async (req, res, next) => {
  try {
    // DISTINCT ON toma un unico fiado por estado, para que la maqueta ilustre
    // los tres casos. Ordenar solo por estado no bastaba: devolvia los tres
    // mas atrasados, que suelen estar todos en 'pendiente'.
    const rows = await db.all(`
      with uno_por_estado as (
        select distinct on (f.estado)
               f.id, f.descripcion, f.monto, f.fecha_vencimiento, f.estado,
               c.nombre as cliente,
               coalesce((select sum(p.monto) from pagos p where p.fiado_id = f.id), 0) as total_pagado
          from fiados f
          join clientes c on c.id = f.cliente_id
         order by f.estado, f.fecha_vencimiento
      )
      select * from uno_por_estado
       order by case estado when 'pendiente' then 1 when 'parcial' then 2 else 3 end
       limit 3`);

    res.json(rows.map(f => ({
      cliente: abreviar(f.cliente),
      descripcion: f.descripcion,
      saldo: calcularSaldo(f.monto, f.total_pagado),
      estado: f.estado,
      dias_mora: calcularMora(f.fecha_vencimiento, f.estado)
    })));
  } catch (e) {
    next(e);
  }
});

// GET /api/publico/demo -> credenciales de la cuenta de demostracion.
//
// Existen para que el docente pueda entrar sin registrarse, y hasta ahora
// estaban escritas a mano en tres archivos (app.html, index.html y
// presentacion.html). Ahora salen de la configuracion: cambiarlas en el
// entorno las cambia en todas partes, y basta con no definirlas para que
// la demo desaparezca del sitio.
router.get('/demo', (req, res) => {
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;

  if (!email || !password) {
    return res.status(404).json({ error: 'No hay cuenta de demostracion configurada' });
  }
  res.json({ email, password });
});

module.exports = { router, abreviar };
