const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'fiados.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ===================== ESQUEMA =====================
// 6 tablas, todas con llave primaria.
// Relaciones: fiados.cliente_id -> clientes.id
//             pagos.fiado_id    -> fiados.id
//             sesiones.usuario_id -> usuarios.id
//             fiados.producto_id -> productos.id
db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'vendedor' CHECK(rol IN ('admin','vendedor','demo')),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  telefono TEXT,
  direccion TEXT,
  limite_credito REAL NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  precio REAL NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fiados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  producto_id INTEGER REFERENCES productos(id),
  descripcion TEXT NOT NULL,
  monto REAL NOT NULL,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  fecha_vencimiento TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','pagado','parcial')),
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fiados_cliente_id ON fiados(cliente_id);

CREATE TABLE IF NOT EXISTS pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fiado_id INTEGER NOT NULL REFERENCES fiados(id) ON DELETE CASCADE,
  monto REAL NOT NULL,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sesiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ===================== SEED MINIMO =====================
// Usuario demo, para que el profesor pueda entrar sin credenciales reales del cliente.
const demoExists = db.prepare('SELECT id FROM usuarios WHERE email = ?').get('demo@ferrefacil.com');
if (!demoExists) {
  const hash = bcrypt.hashSync('Demo2026!', 10);
  db.prepare('INSERT INTO usuarios (email, password_hash, rol) VALUES (?,?,?)')
    .run('demo@ferrefacil.com', hash, 'demo');
}

module.exports = db;
