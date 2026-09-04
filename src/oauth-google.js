// Inicio de sesion con Google, a traves de Supabase Auth.
//
// El flujo corre ENTERO en el servidor, con PKCE. Es deliberado:
//
//  - La CSP de app.js declara script-src 'self' sin CDNs, asi que cargar
//    @supabase/supabase-js en el navegador implicaria vendorizar la libreria
//    o relajar la politica de seguridad.
//  - El flujo implicito devuelve los tokens en el fragmento (#) de la URL,
//    que nunca llega al servidor. Con PKCE vuelven como ?code=, que si se
//    puede canjear aqui.
//  - Asi el token de Supabase no toca el navegador: se cambia por la cookie
//    de sesion httpOnly que la aplicacion ya usaba.
const crypto = require('crypto');

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Secreto efimero que prueba que quien canjea el codigo es quien lo pidio. */
function crearVerifier() {
  return base64url(crypto.randomBytes(32));
}

function challengeDe(verifier) {
  return base64url(crypto.createHash('sha256').update(verifier).digest());
}

/** URL publica de la app, para construir el redirect_to. */
function urlBase(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

/** URL de Supabase a la que se manda al usuario para que elija su cuenta. */
function urlAutorizacion(req, verifier) {
  const params = new URLSearchParams({
    provider: 'google',
    redirect_to: `${urlBase(req)}/api/auth/callback`,
    code_challenge: challengeDe(verifier),
    code_challenge_method: 's256'
  });
  return `${process.env.SUPABASE_URL}/auth/v1/authorize?${params}`;
}

/**
 * Canjea el codigo por la identidad del usuario.
 * Devuelve { email, google_id, nombre, avatar_url } o lanza.
 */
async function canjearCodigo(code, verifier) {
  const res = await fetch(
    `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=pkce`,
    {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ auth_code: code, code_verifier: verifier })
    }
  );

  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Supabase rechazo el codigo (${res.status}): ${detalle.slice(0, 200)}`);
  }

  const data = await res.json();
  const user = data.user || {};
  const meta = user.user_metadata || {};

  if (!user.email) throw new Error('Google no devolvio un correo');

  return {
    email: String(user.email).toLowerCase(),
    google_id: user.id,
    nombre: meta.full_name || meta.name || null,
    avatar_url: meta.avatar_url || meta.picture || null
  };
}

/**
 * Decide si un correo de Google puede entrar.
 *
 * Por defecto Google NO es una puerta de alta: solo entra quien ya existe en
 * `usuarios`. Sin esto, cualquiera con una cuenta de Google veria la cartera
 * completa de clientes y deudas de la ferreteria, porque todas las rutas
 * protegidas se conforman con que haya sesion.
 *
 * GOOGLE_EMAILS_PERMITIDOS (separados por coma) permite dar de alta cuentas
 * nuevas; GOOGLE_DOMINIO_PERMITIDO hace lo mismo para todo un dominio.
 */
function permitido(email) {
  const lista = (process.env.GOOGLE_EMAILS_PERMITIDOS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (lista.includes(email)) return true;

  const dominio = (process.env.GOOGLE_DOMINIO_PERMITIDO || '').trim().toLowerCase();
  if (dominio && email.endsWith('@' + dominio.replace(/^@/, ''))) return true;

  return false;
}

module.exports = { crearVerifier, challengeDe, urlBase, urlAutorizacion, canjearCodigo, permitido, base64url };
