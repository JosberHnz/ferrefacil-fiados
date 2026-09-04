# Fiados Ferrefacil

Control de crédito (fiado) con mora automática para una ferretería real, hecho como Capstone de Ingeniería de Software II.

## Qué resuelve

La ferretería vendía al fiado usando un cuaderno físico. No había forma rápida de saber cuánto debía cada cliente ni desde cuándo. Esta app registra clientes, fiados y pagos, y calcula automáticamente los días de mora de cada deuda vencida.

## Stack

Node.js + Express + PostgreSQL (Supabase, vía `pg`), sesiones por cookie httpOnly, login con Google (Supabase Auth, PKCE resuelto en el servidor), Helmet para headers de seguridad, PWA con Service Worker, tests con Jest + Supertest, CI con GitHub Actions + SonarCloud, desplegado en Vercel.

## Correr en local

```bash
npm install
npm run db:migrate # crea las tablas en Supabase (ver migrations/README.md)
npm run seed      # carga clientes y fiados de ejemplo (opcional)
npm start         # http://localhost:3000
```

Usuario demo: `demo@ferrefacil.com` / `Demo2026!`

## Correr los tests

```bash
npm test
```

Genera cobertura en `coverage/` (usada por SonarCloud vía `coverage/lcov.info`).

## Estructura

```
src/
  app.js           API Express + seguridad + estaticos
  server.js        arranca el servidor
  db.js            pool de PostgreSQL y helpers de consulta
  auth.js          login/logout, middleware de sesion y rol admin
  mora.js          calculo de mora y saldo (logica pura, testeada)
  routes/          auth, clientes, fiados, health
  oauth-google.js  flujo PKCE de inicio de sesion con Google
  migrate.js       aplica migrations/ en orden
  seed.js          datos de ejemplo
  reset.js         vacia las tablas (bloqueado en produccion)
  export-schema.js genera docs/db-export.json desde la DB real
migrations/        SQL numerado y ejecutable a mano en Supabase
public/
  index.html         landing publica del producto (ruta /)
  app.html/app.js    SPA que consume la API (ruta /app)
  manifest.json/sw.js  PWA
  presentacion.html  presentacion autocontenida (entregable 10)
api/
  index.js         entry point serverless para Vercel
docs/
  arquitectura.md    diagrama C4 + decisiones
  adr/               2 ADRs
  db-export.json     esquema real exportado
tests/               Jest + Supertest
```

## Variables de entorno

Ver `.env.example`. En producción (Render) se configuran en el dashboard.

## Despliegue

En produccion corre en Vercel (`vercel.json` + `api/index.js`), en https://josberhnz.lat

Limitacion conocida: en Vercel la base vive en `/tmp`, que es efimero y propio de
cada instancia, asi que los datos se reinician en cada arranque en frio. El esquema
y el usuario demo se recrean solos, asi que la demo siempre arranca usable.

Para persistencia real hace falta un host con disco: ver `render.yaml`, blueprint
listo para Render con disco persistente montado en `/var/data`.
