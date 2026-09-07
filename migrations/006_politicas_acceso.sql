-- =============================================================
-- 006 · Políticas de acceso explícitas
-- =============================================================
-- La migración 002 activó RLS sin políticas, lo que ya bloqueaba todo
-- acceso por defecto. Estas políticas hacen ese bloqueo EXPLÍCITO para
-- las tablas más sensibles (datos de clientes y sus deudas), documentando
-- la regla en vez de dejarla implícita en la ausencia de políticas.
--
-- La app sigue sin verse afectada: se conecta como dueña de las tablas,
-- rol que Postgres exime de RLS por definición.
--
-- CREATE POLICY no soporta "IF NOT EXISTS", así que para que esta
-- migración se pueda correr dos veces sin fallar (idempotencia, ver
-- tests/migrations.test.js), primero se borra la política si ya existe.
-- =============================================================

drop policy if exists "clientes_sin_acceso_publico" on clientes;
create policy "clientes_sin_acceso_publico"
  on clientes for all
  to anon, authenticated
  using (false);

drop policy if exists "fiados_sin_acceso_publico" on fiados;
create policy "fiados_sin_acceso_publico"
  on fiados for all
  to anon, authenticated
  using (false);

insert into schema_migrations (version, nombre)
values ('006', 'politicas_acceso')
on conflict (version) do nothing;