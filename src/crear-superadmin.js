// Crea (o actualiza) el usuario super_admin, leyendo credenciales de
// variables de entorno. El hash se genera aqui mismo, en memoria, y nunca
// se escribe en ningun archivo que se suba a GitHub.
//
// Uso: SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... node src/crear-superadmin.js
// (o definilas en tu .env local, que ya esta ignorado por git)
require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const db = require('./db');

async function crear() {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  const nombre = process.env.SUPERADMIN_NOMBRE || 'Super Admin';

  if (!email || !password) {
    console.error('Definí SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD antes de correr este script.');
    process.exitCode = 1;
    return;
  }

  const hash = bcrypt.hashSync(password, 10);

  await db.query(
    `insert into usuarios (email, password_hash, rol, nombre)
     values ($1, $2, 'super_admin', $3)
     on conflict (email) do update set
       password_hash = excluded.password_hash,
       rol = 'super_admin',
       nombre = excluded.nombre`,
    [email, hash, nombre]
  );

  console.log(`Usuario super_admin listo: ${email}`);
}

crear()
  .catch(e => { console.error('Fallo la creacion del super admin:', e.message); process.exitCode = 1; })
  .finally(() => db.pool.end());