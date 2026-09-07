# Fiados Ferrefacil

Control de crédito (fiado) con mora automática para una ferretería real, hecho como Capstone de Ingeniería de Software II.

## Qué resuelve

La ferretería vendía al fiado usando un cuaderno físico. No había forma rápida de saber cuánto debía cada cliente ni desde cuándo. Esta app registra clientes, fiados y pagos, y calcula automáticamente los días de mora de cada deuda vencida.

## Variables de entorno

Configuralas en el dashboard de Vercel (Settings → Environment Variables), no en un archivo commiteado:

- `DATABASE_URL` — cadena de conexión de Supabase (Settings → Database → Connection string)
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` — del panel de Supabase (Settings → API)
- `APP_URL` — URL pública del sitio, ej. `https://josberhnz.lat`
- `GOOGLE_EMAILS_PERMITIDOS` y/o `GOOGLE_DOMINIO_PERMITIDO` — controla qué cuentas de Google pueden entrar
- `DEMO_EMAIL` / `DEMO_PASSWORD` — credenciales de la cuenta de demostración
- `VERIFICATION_CODE` — `LEARN-CAP-68C65EEC`
- `PG_POOL_MAX` — opcional, por defecto 1 (recomendado en serverless)
- `DB_SCHEMA` — opcional, por defecto `public`

## Despliegue

En producción corre en **Vercel** (`vercel.json` + `api/index.js`), en https://josberhnz.lat, con la base de datos en Supabase (proyecto `software-II`).

## Verificación de propiedad

Código de verificación del proyecto: `LEARN-CAP-68C65EEC`