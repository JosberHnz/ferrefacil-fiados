-- Esquema de Fiados Ferrefacil en PostgreSQL (Supabase).
-- Traduccion del esquema SQLite original de src/db.js.
--
-- Se ejecuta con: npm run db:migrate
-- Es idempotente: se puede correr varias veces sin romper nada.

-- ============================================================
-- USUARIOS
-- ============================================================
create table if not exists usuarios (
  id            bigint generated always as identity primary key,
  email         text not null unique,
  password_hash text not null,
  rol           text not null default 'vendedor'
                check (rol in ('admin', 'vendedor', 'demo')),
  creado_en     timestamptz not null default now()
);

-- ============================================================
-- CLIENTES
-- ============================================================
create table if not exists clientes (
  id             bigint generated always as identity primary key,
  nombre         text not null,
  telefono       text,
  direccion      text,
  -- numeric, NO float: en SQLite esto era REAL y el redondeo de dinero en
  -- coma flotante se estaba parcheando a mano en mora.js.
  limite_credito numeric(12,2) not null default 0 check (limite_credito >= 0),
  creado_en      timestamptz not null default now()
);

-- Sobre lower(nombre) porque la busqueda de clientes usa ILIKE.
create index if not exists idx_clientes_nombre on clientes (lower(nombre));

-- ============================================================
-- PRODUCTOS
-- ============================================================
create table if not exists productos (
  id     bigint generated always as identity primary key,
  nombre text not null,
  precio numeric(12,2) not null check (precio >= 0),
  stock  integer not null default 0 check (stock >= 0)
);

-- ============================================================
-- FIADOS
-- ============================================================
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

create index if not exists idx_fiados_cliente_id on fiados (cliente_id);
-- La vitrina publica y el listado ordenan por vencimiento filtrando estado.
create index if not exists idx_fiados_estado_venc on fiados (estado, fecha_vencimiento);

-- ============================================================
-- PAGOS
-- ============================================================
create table if not exists pagos (
  id        bigint generated always as identity primary key,
  fiado_id  bigint not null references fiados(id) on delete cascade,
  monto     numeric(12,2) not null check (monto > 0),
  fecha     date not null default current_date,
  creado_en timestamptz not null default now()
);

-- Indice nuevo: cada fiado listado hace un SUM(monto) sobre sus pagos.
-- En SQLite esto era un escaneo completo de la tabla en cada request.
create index if not exists idx_pagos_fiado_id on pagos (fiado_id);

-- ============================================================
-- SESIONES
-- ============================================================
create table if not exists sesiones (
  id         bigint generated always as identity primary key,
  usuario_id bigint not null references usuarios(id) on delete cascade,
  token      text not null unique,
  creado_en  timestamptz not null default now(),
  -- La cookie ya caducaba a las 8 horas, pero la fila vivia para siempre.
  -- Ahora la sesion expira tambien del lado del servidor.
  expira_en  timestamptz not null default now() + interval '8 hours'
);

create index if not exists idx_sesiones_token on sesiones (token);

-- ============================================================
-- SEGURIDAD: Row Level Security
-- ============================================================
-- Supabase publica automaticamente todas las tablas por PostgREST, y la
-- clave "anon" es publica por diseno. Sin RLS, cualquiera con esa clave
-- podria leer la cartera completa de clientes y deudas.
--
-- Se activa RLS sin definir ninguna politica: eso deja a anon y authenticated
-- sin acceso a nada. La aplicacion no se ve afectada porque se conecta con el
-- rol dueno de las tablas, que salta RLS por defecto.
alter table usuarios  enable row level security;
alter table clientes  enable row level security;
alter table productos enable row level security;
alter table fiados    enable row level security;
alter table pagos     enable row level security;
alter table sesiones  enable row level security;
