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
-- =============================================================

create policy "clientes_sin_acceso_publico"
  on clientes for all
  to anon, authenticated
  using (false);

create policy "fiados_sin_acceso_publico"
  on fiados for all
  to anon, authenticated
  using (false);

insert into schema_migrations (version, nombre)
values ('006', 'politicas_acceso')
on conflict (version) do nothing;