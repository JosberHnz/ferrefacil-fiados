-- =============================================================
-- 003 · Inicio de sesion con Google
-- =============================================================
-- Anade a `usuarios` los campos que llegan del perfil de Google y permite
-- que existan cuentas sin contrasena local.
--
-- Idempotente: usa "add column if not exists", asi que repetirla no falla.
-- =============================================================

alter table usuarios add column if not exists google_id  text unique;
alter table usuarios add column if not exists nombre     text;
alter table usuarios add column if not exists avatar_url text;

-- Una cuenta creada por Google no tiene contrasena local, asi que la
-- columna deja de ser obligatoria.
--
-- El backend (src/auth.js) rechaza explicitamente el login por formulario
-- cuando password_hash es null: sin esa comprobacion, una cuenta de Google
-- podria entrar con cualquier contrasena.
alter table usuarios alter column password_hash drop not null;

-- -------------------------------------------------------------
insert into schema_migrations (version, nombre)
values ('003', 'auth_google')
on conflict (version) do nothing;
