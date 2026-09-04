-- =============================================================
-- 002 · Row Level Security
-- =============================================================
-- IMPORTANTE. Esta migracion no es opcional.
--
-- Supabase publica automaticamente todas las tablas del esquema public a
-- traves de PostgREST, y la clave "anon" del proyecto es publica por
-- diseno: viaja al navegador de cualquiera que abra el sitio.
--
-- Sin RLS, cualquiera con esa clave podria leer la cartera completa de
-- clientes, telefonos, direcciones y deudas de la ferreteria haciendo una
-- sola peticion HTTP.
--
-- Se activa RLS SIN definir ninguna politica. Eso deja a los roles anon y
-- authenticated sin acceso a nada. La aplicacion no se ve afectada porque
-- se conecta con el rol dueno de las tablas, que salta RLS por defecto.
--
-- Comprobacion despues de ejecutar: en Supabase -> Table Editor, las 6
-- tablas deben mostrar la etiqueta "RLS enabled".
-- =============================================================

alter table usuarios  enable row level security;
alter table clientes  enable row level security;
alter table productos enable row level security;
alter table fiados    enable row level security;
alter table pagos     enable row level security;
alter table sesiones  enable row level security;

-- -------------------------------------------------------------
insert into schema_migrations (version, nombre)
values ('002', 'seguridad_rls')
on conflict (version) do nothing;
