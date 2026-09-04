// Carga los datos de demostracion desde Node.
//
// La fuente canonica es migrations/004_datos_demo.sql: este script existe
// por comodidad (npm run seed) y debe mantenerse alineado con aquella.
// Uso: npm run seed
//
// Idempotente: si ya hay clientes, no hace nada. Para recargar de cero:
//   npm run db:reset
//
// Todas las fechas son RELATIVAS al momento de la carga. La version anterior
// usaba fechas absolutas ('2026-08-30', '2026-07-15'), asi que los ejemplos
// se iban venciendo con el tiempo y la demo terminaba mostrando los tres
// fiados en mora en vez de ilustrar los tres estados.
require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const db = require('./db');

const USUARIOS = [
  { email: 'demo@ferrefacil.com', password: 'Demo2026!', rol: 'demo' },
  { email: 'admin@ferrefacil.com', password: 'Admin2026!', rol: 'admin' }
];

const CLIENTES = [
  { nombre: 'Carlos Martinez',  telefono: '9988-1122', direccion: 'Col. Kennedy, Tegucigalpa',      limite_credito: 3000 },
  { nombre: 'Maria Lopez',      telefono: '9977-3344', direccion: 'Barrio Rio de Piedras',          limite_credito: 1500 },
  { nombre: 'Josue Discua',     telefono: '9955-7788', direccion: 'Col. San Miguel',                limite_credito: 5000 },
  { nombre: 'Wendy Zelaya',     telefono: '9911-2233', direccion: 'Res. Centroamerica Oeste',       limite_credito: 2000 },
  { nombre: 'Constructora Pineda', telefono: '2233-4455', direccion: 'Bulevar Fuerzas Armadas',     limite_credito: 25000 },
  { nombre: 'Óscar Banegas',    telefono: '9900-6677', direccion: 'Col. El Pedregal',               limite_credito: 1200 }
];

// dias: negativo = vencio hace N dias (genera mora), positivo = vence en N dias.
// abonos: pagos parciales ya registrados sobre ese fiado.
const FIADOS = [
  { cliente: 'Carlos Martinez',       descripcion: 'Cemento gris 5 sacos + varilla 3/8',  monto: 2450, dias: -18, abonos: [] },
  { cliente: 'Carlos Martinez',       descripcion: 'Lamina de zinc 4 unidades',           monto: 1680, dias: 12,  abonos: [] },
  { cliente: 'Maria Lopez',           descripcion: 'Tornillos, clavos y bisagras',        monto: 480,  dias: -4,  abonos: [200] },
  { cliente: 'Maria Lopez',           descripcion: 'Pintura latex 1 galon',               monto: 620,  dias: -45, abonos: [620] },
  { cliente: 'Josue Discua',          descripcion: 'Tuberia PVC 2" y pegamento',          monto: 1340, dias: 8,   abonos: [500] },
  { cliente: 'Josue Discua',          descripcion: 'Juego de llaves y alicate',           monto: 890,  dias: -32, abonos: [] },
  { cliente: 'Wendy Zelaya',          descripcion: 'Ceramica piso 12 m2',                 monto: 3200, dias: 20,  abonos: [1000] },
  { cliente: 'Wendy Zelaya',          descripcion: 'Saco de arena y grava',               monto: 350,  dias: -7,  abonos: [] },
  { cliente: 'Constructora Pineda',   descripcion: 'Cemento 40 sacos (obra Col. Miraflores)', monto: 18500, dias: 25, abonos: [8000] },
  { cliente: 'Constructora Pineda',   descripcion: 'Alambre de amarre y clavo de acero',  monto: 2100, dias: -12, abonos: [] },
  { cliente: 'Óscar Banegas',         descripcion: 'Foco LED 10 unidades',                monto: 450,  dias: -60, abonos: [450] },
  { cliente: 'Óscar Banegas',         descripcion: 'Cable THHN 100 metros',               monto: 1150, dias: 5,   abonos: [] }
];

async function seed() {
  const { rows: [{ n }] } = await db.query('select count(*)::int as n from clientes');
  if (n > 0) {
    console.log(`Ya existen ${n} clientes; no se insertaron datos de ejemplo.`);
    console.log('Para recargar desde cero: npm run db:reset');
    return;
  }

  await db.tx(async client => {
    // --- usuarios ---
    const usuarios = {};
    for (const u of USUARIOS) {
      const hash = bcrypt.hashSync(u.password, 10);
      const { rows: [fila] } = await client.query(
        `insert into usuarios (email, password_hash, rol) values ($1, $2, $3)
         on conflict (email) do update set password_hash = excluded.password_hash
         returning id, email`,
        [u.email, hash, u.rol]
      );
      usuarios[fila.email] = fila.id;
    }

    // --- clientes ---
    const clientes = {};
    for (const c of CLIENTES) {
      const { rows: [fila] } = await client.query(
        `insert into clientes (nombre, telefono, direccion, limite_credito)
         values ($1, $2, $3, $4) returning id, nombre`,
        [c.nombre, c.telefono, c.direccion, c.limite_credito]
      );
      clientes[fila.nombre] = fila.id;
    }

    // --- fiados y sus abonos ---
    const creadoPor = usuarios['admin@ferrefacil.com'];
    for (const f of FIADOS) {
      const pagado = f.abonos.reduce((a, b) => a + b, 0);
      const estado = pagado >= f.monto ? 'pagado' : pagado > 0 ? 'parcial' : 'pendiente';

      const { rows: [fiado] } = await client.query(
        `insert into fiados
           (cliente_id, descripcion, monto, fecha, fecha_vencimiento, estado, creado_por)
         values ($1, $2, $3,
                 current_date - 30,
                 current_date + ($4 || ' days')::interval,
                 $5, $6)
         returning id`,
        [clientes[f.cliente], f.descripcion, f.monto, String(f.dias), estado, creadoPor]
      );

      for (const abono of f.abonos) {
        await client.query(
          `insert into pagos (fiado_id, monto, fecha)
           values ($1, $2, current_date - 5)`,
          [fiado.id, abono]
        );
      }
    }
  });

  const resumen = await db.all(`
    select estado, count(*)::int as n, sum(monto)::float as total
      from fiados group by estado order by estado`);

  console.log('Datos de ejemplo insertados.\n');
  console.log(`  usuarios: ${USUARIOS.length}   clientes: ${CLIENTES.length}   fiados: ${FIADOS.length}`);
  resumen.forEach(r => console.log(`  ${r.estado.padEnd(10)} ${String(r.n).padStart(2)} fiados   L. ${r.total.toFixed(2)}`));
}

seed()
  .catch(e => { console.error('Fallo el seed:', e.message); process.exitCode = 1; })
  .finally(() => db.pool.end());
