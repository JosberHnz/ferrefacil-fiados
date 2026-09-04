-- =============================================================
-- 004 · Datos de demostracion
-- =============================================================
-- Carga 2 usuarios, 6 clientes, 12 fiados y 6 abonos.
--
-- Las fechas son RELATIVAS al dia en que se ejecuta la migracion. La
-- version anterior del seed usaba fechas fijas ('2026-08-30'), asi que los
-- ejemplos se vencian con el paso del tiempo y la demo acababa mostrando
-- todo en mora en vez de ilustrar los tres estados.
--
-- Idempotente: cada bloque comprueba antes si el registro ya existe, asi
-- que repetir la migracion no duplica nada.
--
-- OPCIONAL: si prefieres arrancar con la base vacia, salta este archivo.
-- =============================================================

-- -------------------------------------------------------------
-- Usuarios
-- -------------------------------------------------------------
-- Los hash son bcrypt (coste 10), generados aparte para no depender de la
-- extension pgcrypto. Corresponden a:
--   demo@ferrefacil.com  -> Demo2026!
--   admin@ferrefacil.com -> Admin2026!
--
-- Son credenciales de demostracion, publicadas a proposito en la landing.
-- Si esta base va a guardar datos reales de la ferreteria, cambia estas
-- contrasenas.
insert into usuarios (email, password_hash, rol)
values
  ('demo@ferrefacil.com',  '$2a$10$gYSwGQpXaCpxyfIHRxLVW.FW/SY/Dva5pYQvb27p6e.ykX.qy92IO', 'demo'),
  ('admin@ferrefacil.com', '$2a$10$r5lqIwy8LJbIRTa9Y2dRHOEMXFmaN097KaERTiwAa8rOBqWatC2Hu', 'admin')
on conflict (email) do nothing;

-- -------------------------------------------------------------
-- Clientes
-- -------------------------------------------------------------
insert into clientes (nombre, telefono, direccion, limite_credito)
select v.nombre, v.telefono, v.direccion, v.limite_credito
from (values
  ('Carlos Martinez',       '9988-1122', 'Col. Kennedy, Tegucigalpa',    3000::numeric),
  ('Maria Lopez',           '9977-3344', 'Barrio Rio de Piedras',        1500::numeric),
  ('Josue Discua',          '9955-7788', 'Col. San Miguel',              5000::numeric),
  ('Wendy Zelaya',          '9911-2233', 'Res. Centroamerica Oeste',     2000::numeric),
  ('Constructora Pineda',   '2233-4455', 'Bulevar Fuerzas Armadas',     25000::numeric),
  ('Óscar Banegas',         '9900-6677', 'Col. El Pedregal',             1200::numeric)
) as v(nombre, telefono, direccion, limite_credito)
where not exists (select 1 from clientes c where c.nombre = v.nombre);

-- -------------------------------------------------------------
-- Fiados
-- -------------------------------------------------------------
-- La columna "dias" es relativa a hoy: negativo = ya vencio (genera mora),
-- positivo = vence en el futuro.
insert into fiados (cliente_id, descripcion, monto, fecha, fecha_vencimiento, estado, creado_por)
select c.id,
       v.descripcion,
       v.monto,
       current_date - 30,
       (current_date + (v.dias || ' days')::interval)::date,
       v.estado,
       (select id from usuarios where email = 'admin@ferrefacil.com')
from (values
  ('Carlos Martinez',     'Cemento gris 5 sacos + varilla 3/8',       2450::numeric, -18, 'pendiente'),
  ('Carlos Martinez',     'Lamina de zinc 4 unidades',                1680::numeric,  12, 'pendiente'),
  ('Maria Lopez',         'Tornillos, clavos y bisagras',              480::numeric,  -4, 'parcial'),
  ('Maria Lopez',         'Pintura latex 1 galon',                     620::numeric, -45, 'pagado'),
  ('Josue Discua',        'Tuberia PVC 2" y pegamento',       1340::numeric,   8, 'parcial'),
  ('Josue Discua',        'Juego de llaves y alicate',                 890::numeric, -32, 'pendiente'),
  ('Wendy Zelaya',        'Ceramica piso 12 m2',                      3200::numeric,  20, 'parcial'),
  ('Wendy Zelaya',        'Saco de arena y grava',                     350::numeric,  -7, 'pendiente'),
  ('Constructora Pineda', 'Cemento 40 sacos (obra Col. Miraflores)', 18500::numeric,  25, 'parcial'),
  ('Constructora Pineda', 'Alambre de amarre y clavo de acero',       2100::numeric, -12, 'pendiente'),
  ('Óscar Banegas',       'Foco LED 10 unidades',                      450::numeric, -60, 'pagado'),
  ('Óscar Banegas',       'Cable THHN 100 metros',                    1150::numeric,   5, 'pendiente')
) as v(cliente, descripcion, monto, dias, estado)
join clientes c on c.nombre = v.cliente
where not exists (select 1 from fiados f where f.descripcion = v.descripcion);

-- -------------------------------------------------------------
-- Abonos
-- -------------------------------------------------------------
-- Son los pagos parciales que justifican los estados 'parcial' y 'pagado'
-- de arriba. Sin ellos, el saldo mostrado no cuadraria con el estado.
insert into pagos (fiado_id, monto, fecha)
select f.id, v.monto, current_date - 5
from (values
  ('Tornillos, clavos y bisagras',              200::numeric),
  ('Pintura latex 1 galon',                     620::numeric),
  ('Tuberia PVC 2" y pegamento',        500::numeric),
  ('Ceramica piso 12 m2',                      1000::numeric),
  ('Cemento 40 sacos (obra Col. Miraflores)',  8000::numeric),
  ('Foco LED 10 unidades',                      450::numeric)
) as v(descripcion, monto)
join fiados f on f.descripcion = v.descripcion
where not exists (select 1 from pagos p where p.fiado_id = f.id);

-- -------------------------------------------------------------
insert into schema_migrations (version, nombre)
values ('004', 'datos_demo')
on conflict (version) do nothing;

-- Resumen de lo cargado. El resultado aparece en el panel de Supabase.
select estado,
       count(*)          as fiados,
       sum(monto)        as total,
       sum(case when fecha_vencimiento < current_date
                 and estado <> 'pagado' then 1 else 0 end) as en_mora
  from fiados
 group by estado
 order by estado;
