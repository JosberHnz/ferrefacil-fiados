// Carga datos de ejemplo para que la demo no arranque vacia.
// Uso: npm run seed
const db = require('./db');

const clientes = [
  { nombre: 'Carlos Martinez', telefono: '9988-1122', direccion: 'Col. Kennedy', limite_credito: 3000 },
  { nombre: 'Maria Lopez', telefono: '9977-3344', direccion: 'Barrio Rio de Piedras', limite_credito: 1500 }
];

const insertCliente = db.prepare(
  'INSERT INTO clientes (nombre, telefono, direccion, limite_credito) VALUES (?,?,?,?)'
);
const insertFiado = db.prepare(
  `INSERT INTO fiados (cliente_id, descripcion, monto, fecha_vencimiento) VALUES (?,?,?,?)`
);

const existentes = db.prepare('SELECT COUNT(*) AS n FROM clientes').get().n;
if (existentes === 0) {
  const c1 = insertCliente.run(...Object.values(clientes[0])).lastInsertRowid;
  const c2 = insertCliente.run(...Object.values(clientes[1])).lastInsertRowid;

  insertFiado.run(c1, 'Cemento 5 sacos + varilla', 850, '2026-08-30');
  insertFiado.run(c1, 'Pintura 1 galon', 420, '2026-07-15'); // vencido, para ver mora
  insertFiado.run(c2, 'Tornillos y clavos varios', 180, '2026-09-05');

  console.log('Datos de ejemplo insertados.');
} else {
  console.log('Ya existen clientes, no se insertaron datos de ejemplo.');
}
