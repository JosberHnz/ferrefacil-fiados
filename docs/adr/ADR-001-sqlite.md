# ADR-001: Usar SQLite embebido en vez de Postgres gestionado

## Contexto

Fiados Ferrefacil necesita persistir clientes, fiados y pagos para una sola
ferreteria pequena. El volumen esperado es de decenas de clientes y unos
pocos cientos de fiados al mes, no miles de escrituras concurrentes.

## Decision

Usar SQLite embebido en un archivo (`data/fiados.db`), a traves de
`better-sqlite3`, en vez de contratar un Postgres gestionado (Neon, Supabase,
RDS, etc).

## Consecuencias

**Ventajas:**
- Cero configuracion de red, cero credenciales de base de datos que proteger o rotar.
- El backup es copiar un archivo (ver entregable de respaldo).
- Lecturas sincronas y simples, sin pool de conexiones que administrar.
- Se despliega junto al servidor en Render con un disco persistente, sin depender de un tercer proveedor.

**Sacrificios (lo que se sacrifico y por que valio la pena):**
- **No soporta escrituras concurrentes de multiples procesos/instancias.** Se sacrifico la posibilidad de escalar horizontalmente el backend a varias instancias, porque este cliente no lo necesita: es una sola ferreteria, un vendedor a la vez en el mostrador.
- **No hay Row Level Security nativo** como en Postgres/Supabase. Se compenso implementando las politicas de acceso a nivel de aplicacion (middleware `requireAuth` y `requireAdmin`), documentadas en `src/auth.js`.
- Si el negocio crece a varias sucursales, esta decision se revisita y se migra a Postgres — el codigo de acceso a datos esta aislado en `src/db.js`, por lo que el cambio no obligaria a reescribir las rutas.
