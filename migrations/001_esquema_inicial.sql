-- =============================================================
-- 001 · Esquema inicial
-- =============================================================
-- Crea las 6 tablas del sistema con sus indices y relaciones.
--
-- Es idempotente: si las tablas ya existen no las toca ni borra datos,
-- asi que se puede ejecutar sobre una base ya poblada sin riesgo.
--
-- Ejecutar en: Supabase -> SQL Editor -> New query -> pegar -> Run
-- =============================================================

-- Registro de migraciones aplicadas. Sirve para saber por cual vas.
create table if not exists schema_migrations (
  version     text primary key,
  nombre      text not null,
  aplicada_en timestamptz not null default now()
);

-- -------------------------------------------------------------
-- usuarios
-- -------------------------------------------------------------
create table if not exists usuarios (
  id            bigint generated always as identity primary key,
  email         text not null unique,
  password_hash text not null,
  rol           text not null default 'vendedor'
                check (rol in ('admin', 'vendedor', 'demo')),
  creado_en     timestamptz not null default now()
);

-- -------------------------------------------------------------
-- clientes
-- -------------------------------------------------------------
create table if not exists clientes (
  id             bigint generated always as identity primary key,
  nombre         text not null,
  telefono       text,
  direccion      text,
  -- numeric y no float: el dinero en coma flotante acumula errores de
  -- redondeo. El esquema original usaba REAL y habia que parchearlo en
  -- la aplicacion.
  limite_credito numeric(12,2) not null default 0 check (limite_credito >= 0),
  creado_en      timestamptz not null default now()
);

-- Sobre lower(nombre) porque la busqueda de clientes usa ILIKE.
create index if not exists idx_clientes_nombre on clientes (lower(nombre));

-- -------------------------------------------------------------
-- productos
-- -------------------------------------------------------------
create table if not exists productos (
  id     bigint generated always as identity primary key,
  nombre text not null,
  precio numeric(12,2) not null check (precio >= 0),
  stock  integer not null default 0 check (stock >= 0)
);

-- -------------------------------------------------------------
-- fiados
-- -------------------------------------------------------------
create table if not exists fiados (
  id                bigint generated always as identity primary key,
  cliente_id        bigint not null references clientes(id) on delete cascade,
  producto_id       bigint references productos(id),
  descripcion       text not null,
  monto             numeric(12,2) not null check (monto > 0),
  fecha             date not null default current_date,
  fecha_vencimiento date not null,
  estado            text not null default 'pendiente'
                    check (estado in ('pendiente', 'pagado', 'parcial')),
  creado_por        bigint references usuarios(id),
  creado_en         timestamptz not null default now()
);

create index if not exists idx_fiados_cliente_id  on fiados (cliente_id);
create index if not exists idx_fiados_estado_venc on fiados (estado, fecha_vencimiento);

-- -------------------------------------------------------------
-- pagos
-- -------------------------------------------------------------
create table if not exists pagos (
  id        bigint generated always as identity primary key,
  fiado_id  bigint not null references fiados(id) on delete cascade,
  monto     numeric(12,2) not null check (monto > 0),
  fecha     date not null default current_date,
  creado_en timestamptz not null default now()
);

-- Cada fiado listado suma sus pagos; sin este indice era un escaneo
-- completo de la tabla en cada consulta.
create index if not exists idx_pagos_fiado_id on pagos (fiado_id);

-- -------------------------------------------------------------
-- sesiones
-- -------------------------------------------------------------
create table if not exists sesiones (
  id         bigint generated always as identity primary key,
  usuario_id bigint not null references usuarios(id) on delete cascade,
  token      text not null unique,
  creado_en  timestamptz not null default now(),
  -- La cookie caduca a las 8 horas; sin esta columna la fila del servidor
  -- vivia para siempre y la sesion nunca expiraba de verdad.
  expira_en  timestamptz not null default now() + interval '8 hours'
);

create index if not exists idx_sesiones_token on sesiones (token);

-- -------------------------------------------------------------
insert into schema_migrations (version, nombre)
values ('001', 'esquema_inicial')
on conflict (version) do nothing;
