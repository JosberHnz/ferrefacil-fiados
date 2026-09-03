# Fiados Ferrefacil

Control de crédito (fiado) con mora automática para una ferretería real, hecho como Capstone de Ingeniería de Software II.

## Qué resuelve

La ferretería vendía al fiado usando un cuaderno físico. No había forma rápida de saber cuánto debía cada cliente ni desde cuándo. Esta app registra clientes, fiados y pagos, y calcula automáticamente los días de mora de cada deuda vencida.

## Stack

Node.js + Express + SQLite (better-sqlite3), sesiones por cookie httpOnly, Helmet para headers de seguridad, PWA con Service Worker, tests con Jest + Supertest, CI con GitHub Actions + SonarCloud, desplegado en Render.

## Correr en local

```bash
npm install
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
  db.js            esquema SQLite + seed de usuario demo
  auth.js          login/logout, middleware de sesion y rol admin
  mora.js          calculo de mora y saldo (logica pura, testeada)
  routes/          auth, clientes, fiados, health
  seed.js          datos de ejemplo
  export-schema.js genera docs/db-export.json desde la DB real
public/
  index.html/app.js  SPA que consume la API
  manifest.json/sw.js  PWA
  presentacion.html  presentacion autocontenida (entregable 10)
docs/
  arquitectura.md    diagrama C4 + decisiones
  adr/               2 ADRs
  db-export.json     esquema real exportado
tests/               Jest + Supertest
```

## Variables de entorno

Ver `.env.example`. En producción (Render) se configuran en el dashboard.

## Despliegue

Ver `render.yaml` — blueprint listo para Render (disco persistente para que SQLite no se borre entre despliegues).
