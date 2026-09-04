-- =============================================================
-- 005 · Idempotencia de operaciones de escritura
-- =============================================================
-- Evita que una misma accion se registre varias veces.
--
-- El caso concreto: el encargado toca "Abonar" tres veces porque la red va
-- lenta y no ve respuesta. Hoy eso registra tres pagos y descuadra la
-- deuda del cliente. Deshabilitar el boton en el navegador ayuda, pero no
-- resuelve un reintento del navegador, una recarga o un doble envio desde
-- otra pestana: la garantia tiene que estar en el servidor.
--
-- Cada peticion de escritura llega con una cabecera Idempotency-Key. La
-- primera vez se guarda aqui junto con su respuesta; si vuelve a llegar la
-- misma clave, se devuelve la respuesta almacenada sin volver a tocar la
-- base de datos.
-- =============================================================

create table if not exists idempotencia (
  clave       text primary key,
  usuario_id  bigint references usuarios(id) on delete cascade,
  metodo      text not null,
  ruta        text not null,
  -- Hash del cuerpo de la peticion. Si llega la misma clave con datos
  -- distintos es un error del cliente, no un reintento, y se rechaza:
  -- reutilizar una clave para otra operacion enmascararia un fallo real.
  huella      text not null,
  -- null mientras la peticion original sigue en curso. Sirve para detectar
  -- dos envios simultaneos de la misma clave.
  estado_http integer,
  respuesta   jsonb,
  creado_en   timestamptz not null default now()
);

-- Para poder purgar las claves viejas sin escanear la tabla entera.
create index if not exists idx_idempotencia_creado on idempotencia (creado_en);

-- RLS, por el mismo motivo que la migracion 002. Y aqui importa aun mas:
-- la columna `respuesta` guarda el cuerpo devuelto por la API, que incluye
-- nombres, telefonos y saldos de clientes. Sin RLS, la clave anon publica
-- podria leer esos datos aunque las tablas originales si esten protegidas.
alter table idempotencia enable row level security;

-- -------------------------------------------------------------
insert into schema_migrations (version, nombre)
values ('005', 'idempotencia')
on conflict (version) do nothing;
