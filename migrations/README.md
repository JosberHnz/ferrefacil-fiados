# Migraciones

Scripts SQL numerados que construyen la base de datos en Supabase.

## Orden

| # | Archivo | Qué hace | ¿Obligatoria? |
|---|---------|----------|---------------|
| 001 | `001_esquema_inicial.sql` | Las 6 tablas, índices y relaciones | Sí |
| 002 | `002_seguridad_rls.sql` | Activa Row Level Security | **Sí — leer abajo** |
| 003 | `003_auth_google.sql` | Campos de Google en `usuarios` | Sí |
| 004 | `004_datos_demo.sql` | 6 clientes, 12 fiados, 6 abonos | No |

Hay que ejecutarlas **en orden**: la 003 modifica la tabla que crea la 001,
y la 004 necesita que existan las tablas y el usuario admin.

## Cómo ejecutarlas a mano en Supabase

1. Abrí tu proyecto en <https://supabase.com/dashboard>
2. Menú lateral → **SQL Editor** → **New query**
3. Pegá el contenido completo de un archivo
4. **Run** (o `Ctrl+Enter`)
5. Repetí con el siguiente número

## Cómo ejecutarlas desde el proyecto

```bash
npm run db:migrate
```

Aplica las pendientes en orden y salta las que ya están registradas.

## Son idempotentes

Todas usan `if not exists` o `on conflict do nothing`. Podés ejecutarlas
sobre una base que ya tiene datos: **no borran ni duplican nada**. Si dudás
de por dónde ibas, ejecutalas todas otra vez.

Para saber qué se aplicó:

```sql
select * from schema_migrations order by version;
```

## Sobre la 002 (RLS)

No es opcional aunque el sistema funcione sin ella.

Supabase publica automáticamente todas las tablas de `public` a través de
PostgREST, y la clave `anon` del proyecto es pública por diseño: viaja al
navegador de cualquiera que abra el sitio. Sin RLS, esa clave permite leer
la cartera completa de clientes, teléfonos, direcciones y deudas con una
sola petición HTTP.

La 002 activa RLS **sin definir políticas**, lo que deja a `anon` y
`authenticated` sin acceso a nada. La aplicación no se ve afectada porque
se conecta con el rol dueño de las tablas, que salta RLS por defecto.

Para comprobarlo: *Table Editor* → las 6 tablas deben decir «RLS enabled».

## Sobre la 004 (datos demo)

Es opcional; saltala si querés arrancar con la base vacía.

Las fechas son **relativas al día en que la ejecutás**, así que la demo
siempre muestra los tres estados (pendiente, parcial y pagado) y unos
cuantos fiados en mora, sin importar cuándo la cargues.

Incluye dos usuarios con contraseña bcrypt ya calculada:

- `demo@ferrefacil.com` / `Demo2026!` (rol `demo`)
- `admin@ferrefacil.com` / `Admin2026!` (rol `admin`)

Son credenciales de demostración y se publican a propósito en la landing.
**Si esta base va a guardar datos reales de la ferretería, cambialas.**

## Agregar una migración nueva

Creá el archivo con el número siguiente y el mismo formato:

```sql
-- =============================================================
-- 005 · Descripción corta
-- =============================================================

alter table clientes add column if not exists correo text;

insert into schema_migrations (version, nombre)
values ('005', 'descripcion_corta')
on conflict (version) do nothing;
```

Dos reglas: que sea idempotente, y que registre su versión al final.
Nunca edites una migración ya aplicada en producción — creá una nueva.
