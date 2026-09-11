-- =============================================================
-- 007 · Feedback de usuarios, tickets de errores y rol super_admin
-- =============================================================
-- Agrega:
--   - tabla feedback: comentarios que dejan los usuarios logueados
--   - tabla tickets_error: cada error real del servidor se guarda aqui solo
--   - rol 'super_admin', con mas permisos que 'admin'
--
-- El usuario super admin NO se crea aqui a proposito: un hash de contrasena
-- fijo en un archivo SQL versionado es, en la practica, tan expuesto como
-- la contrasena en texto plano (cualquiera puede probar contrasenas comunes
-- contra ese hash). Se crea aparte con src/crear-superadmin.js, que genera
-- el hash en el momento a partir de variables de entorno nunca commiteadas.
-- =============================================================

alter table usuarios drop constraint if exists usuarios_rol_check;
alter table usuarios add constraint usuarios_rol_check
  check (rol in ('admin', 'super_admin', 'vendedor', 'demo'));

create table if not exists feedback (
  id integer generated always as identity primary key,
  usuario_id integer not null references usuarios(id) on delete cascade,
  mensaje text not null,
  creado_en timestamptz not null default now()
);
create index if not exists idx_feedback_creado_en on feedback(creado_en desc);

create table if not exists tickets_error (
  id integer generated always as identity primary key,
  mensaje text not null,
  ruta text,
  metodo text,
  usuario_id integer references usuarios(id) on delete set null,
  estado text not null default 'abierto' check (estado in ('abierto', 'en_revision', 'resuelto')),
  diagnostico text,
  creado_en timestamptz not null default now(),
  resuelto_en timestamptz
);
create index if not exists idx_tickets_error_estado on tickets_error(estado);
create index if not exists idx_tickets_error_creado_en on tickets_error(creado_en desc);

alter table feedback enable row level security;
alter table tickets_error enable row level security;

drop policy if exists "feedback_sin_acceso_publico" on feedback;
create policy "feedback_sin_acceso_publico"
  on feedback for all
  to anon, authenticated
  using (false);

drop policy if exists "tickets_error_sin_acceso_publico" on tickets_error;
create policy "tickets_error_sin_acceso_publico"
  on tickets_error for all
  to anon, authenticated
  using (false);

insert into schema_migrations (version, nombre)
values ('007', 'feedback_tickets_superadmin')
on conflict (version) do nothing;