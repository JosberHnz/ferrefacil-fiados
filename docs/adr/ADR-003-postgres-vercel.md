# ADR-003: Migrar de SQLite embebido a PostgreSQL (Supabase), desplegado en Vercel

## Contexto

El ADR-001 eligió SQLite embebido para simplificar la operación de un solo
servidor con disco propio (Render). Al avanzar el proyecto, se decidió
desplegar en Vercel para tener funciones serverless y despliegues
automáticos por Pull Request. Vercel no ofrece disco persistente propio por
instancia: cada invocación de la función corre en un entorno efímero, así
que un archivo SQLite local se reiniciaría vacío en cada arranque en frío,
perdiendo todos los datos reales de fiados y clientes.

## Decisión

Migrar la persistencia a PostgreSQL gestionado por Supabase (plan gratuito),
accedido desde la función serverless con el driver `pg` mediante un pool de
conexiones (`src/db.js`), en vez de SQLite embebido.

## Consecuencias

**Ventajas:**
- **Durabilidad real en un entorno serverless**: los datos ya no dependen del disco de una instancia efímera; sobreviven a cada arranque en frío de Vercel.
- Supabase ofrece un panel visual (Table Editor, Schema Visualizer) que facilita depurar datos reales durante el desarrollo y la sustentación.
- El pool de conexiones se limita a 1 (`PG_POOL_MAX=1`) porque el *transaction pooler* de Supabase ya multiplexa conexiones del lado del servidor — abrir más por instancia serverless solo gastaría cupo del proyecto sin ganar concurrencia real.

**Sacrificios (lo que se sacrificó y por qué valió la pena):**
- **Se perdió la simplicidad operativa de un archivo único** que documentaba el ADR-001: ahora hay una dependencia de red externa (Supabase) y una cadena de conexión (`DATABASE_URL`) que proteger como secreto en las variables de entorno de Vercel.
- **Se perdieron las lecturas síncronas** que tenía `better-sqlite3`/`node:sqlite`; todo el acceso a datos pasó a ser asíncrono (`async/await` sobre el pool de `pg`), lo que obligó a revisar cada ruta de `src/routes/`.
- Se aceptó este costo porque, para un despliegue serverless en Vercel, la alternativa (SQLite en disco efímero) simplemente no puede garantizar que los datos de un negocio real sobrevivan — no es una cuestión de preferencia sino de que la arquitectura anterior no era viable en este nuevo entorno de despliegue.