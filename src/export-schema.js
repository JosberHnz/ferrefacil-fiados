// Genera docs/db-export.json a partir del esquema REAL de la base de datos
// (no escrito a mano), consultando las tablas de sistema de SQLite.
// Uso: node src/export-schema.js
const fs = require('fs');
const path = require('path');
const db = require('./db');

const tablasSistema = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
).all().map(r => r.name);

const tablas = tablasSistema.map(nombre => {
  const columnas = db.prepare(`PRAGMA table_info(${nombre})`).all().map(c => ({
    nombre: c.name,
    tipo: c.type,
    pk: !!c.pk,
    nulo: !c.notnull
  }));

  const fks = db.prepare(`PRAGMA foreign_key_list(${nombre})`).all().map(fk => ({
    columna: fk.from,
    referencia: `${fk.table}.${fk.to}`
  }));

  const indices = db.prepare(`PRAGMA index_list(${nombre})`).all()
    .filter(i => !i.origin || i.origin === 'c')
    .map(i => i.name);

  const filas = db.prepare(`SELECT COUNT(*) AS n FROM ${nombre}`).get().n;

  return { nombre, filas, columnas, indices, relaciones: fks };
});

const salida = {
  generado_at: new Date().toISOString(),
  motor: 'sqlite',
  tablas
};

const outPath = path.join(__dirname, '..', 'docs', 'db-export.json');
fs.writeFileSync(outPath, JSON.stringify(salida, null, 2));
console.log('Esquema exportado a', outPath);
