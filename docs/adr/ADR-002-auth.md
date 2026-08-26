# ADR-002: Autenticacion con sesiones en cookie httpOnly en vez de JWT

## Contexto

El sistema necesita saber quien esta autenticado en cada request para
proteger las rutas de clientes y fiados, y para distinguir el rol `admin`
(puede borrar clientes) del resto.

## Decision

Usar tokens de sesion opacos, guardados en la tabla `sesiones` y enviados
al navegador en una cookie `httpOnly` + `sameSite=lax`, en vez de JSON Web
Tokens (JWT) firmados sin estado.

## Consecuencias

**Ventajas:**
- **Revocacion inmediata**: cerrar sesion borra la fila en `sesiones`; con JWT sin estado, un token robado sigue siendo valido hasta que expira, sin forma de invalidarlo antes.
- Cookie `httpOnly` no es accesible desde JavaScript del navegador, lo que reduce el riesgo de robo de sesion via XSS (complementa el header CSP del entregable de seguridad).
- Mas facil de auditar en la sustentacion: cualquier sesion activa es una fila real y visible en la base de datos.

**Sacrificios (lo que se sacrifico y por que valio la pena):**
- **Se sacrifico la posibilidad de escalar sin estado** (stateless) entre multiples servidores, porque cada verificacion de sesion consulta la base de datos. Para este cliente (un solo servidor en Render, bajo trafico) el costo es insignificante comparado con la seguridad de poder revocar sesiones al instante.
- No sirve para autenticar a un tercero externo (por ejemplo, una app movil de otro equipo) sin compartir la misma base de datos de sesiones; no es un caso de uso que este cliente necesite hoy.
