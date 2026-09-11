-- =============================================================
-- 007 · Feedback de usuarios, tickets de errores y super admin
-- =============================================================
-- Agrega:
--   - tabla feedback: comentarios que dejan los usuarios logueados
--   - tabla tickets_error: cada error real del servidor se guarda aqui solo
--   - rol 'super_admin', con mas permisos que 'admin'
--   - usuario super admin para revision del proyecto
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

-- Usuario super admin para revision del proyecto.
-- Contraseña de demostracion (123) intencionalmente simple para revision
-- academica. NO usar este patron en un sistema con datos reales de produccion.
insert into usuarios (email, password_hash, rol, nombre)
values (
  'jova889@gmail.com',
  '$2b$10$IA97fi05EKHbxCyR7N1rqu/n8BGTpoVClmN6hIV01WUdWUZiBFoeG',
  'super_admin',
  'joaleman'
)
on conflict (email) do update set
  password_hash = excluded.password_hash,
  rol = excluded.rol,
  nombre = excluded.nombre;

insert into schema_migrations (version, nombre)
values ('007', 'feedback_tickets_superadmin')
on conflict (version) do nothing;