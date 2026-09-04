const API = '/api';
let clientesCache = [];

// Clave unica por intento. El servidor la usa para reconocer reintentos y
// no repetir la operacion (ver src/idempotencia.js).
function nuevaClave(){
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now() + '-' + Math.random().toString(16).slice(2);
}

// Deshabilita un boton mientras su operacion esta en vuelo. Es la primera
// barrera contra el doble clic; la garantia de verdad es la del servidor,
// porque esta no cubre una recarga ni una segunda pestana.
async function conBoton(id, fn){
  const btn = document.getElementById(id);
  if (btn.disabled) return;
  const texto = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  try { await fn(); }
  catch (e) { alert(e.message || 'No se pudo completar la operacion'); }
  finally { btn.disabled = false; btn.textContent = texto; }
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (opts.clave) headers['Idempotency-Key'] = opts.clave;

  const res = await fetch(API + path, {
    credentials: 'same-origin',
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) }
  });
  if (res.status === 401) { showLogin(); throw new Error('No autenticado'); }
  if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error || 'Error');
  return res.json();
}

function showLogin(){
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}
function showApp(){
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  cargarTodo();
}

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errBox = document.getElementById('login-error');
  errBox.classList.add('hidden');
  try {
    await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    showApp();
  } catch (err) {
    errBox.textContent = 'Correo o contraseña incorrectos';
    errBox.classList.remove('hidden');
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await fetch(API + '/auth/logout', { method: 'POST' });
  showLogin();
});

document.getElementById('btn-crear-cliente').addEventListener('click', () =>
  conBoton('btn-crear-cliente', async () => {
    const nombre = document.getElementById('c-nombre').value.trim();
    const telefono = document.getElementById('c-telefono').value.trim();
    if (!nombre) return alert('El nombre es requerido');
    await api('/clientes', {
      method: 'POST', clave: nuevaClave(),
      body: JSON.stringify({ nombre, telefono })
    });
    document.getElementById('c-nombre').value = '';
    document.getElementById('c-telefono').value = '';
    await cargarClientes();
  }));

document.getElementById('btn-crear-fiado').addEventListener('click', () =>
  conBoton('btn-crear-fiado', async () => {
    const cliente_id = document.getElementById('f-cliente').value;
    const descripcion = document.getElementById('f-desc').value.trim();
    const monto = document.getElementById('f-monto').value;
    const fecha_vencimiento = document.getElementById('f-vence').value;
    if (!cliente_id || !descripcion || !monto || !fecha_vencimiento) return alert('Completá todos los campos');
    await api('/fiados', {
      method: 'POST', clave: nuevaClave(),
      body: JSON.stringify({ cliente_id, descripcion, monto, fecha_vencimiento })
    });
    document.getElementById('f-desc').value = '';
    document.getElementById('f-monto').value = '';
    await cargarFiados();
  }));

// El abono es el caso mas delicado: repetirlo descuadra la deuda real del
// cliente. Se bloquea por fiado, no globalmente, para poder abonar a dos
// fiados distintos sin esperar.
const abonosEnCurso = new Set();

async function pagar(fiadoId){
  if (abonosEnCurso.has(fiadoId)) return;

  const monto = prompt('¿Cuánto se abona?');
  if (!monto) return;

  abonosEnCurso.add(fiadoId);
  const boton = document.querySelector(`[data-pagar="${fiadoId}"]`);
  if (boton) boton.disabled = true;

  try {
    await api(`/fiados/${fiadoId}/pagos`, {
      method: 'POST', clave: nuevaClave(),
      body: JSON.stringify({ monto: Number(monto) })
    });
    await cargarFiados();
  } catch (e) {
    alert(e.message || 'No se pudo registrar el abono');
    if (boton) boton.disabled = false;
  } finally {
    abonosEnCurso.delete(fiadoId);
  }
}

async function cargarClientes(){
  clientesCache = await api('/clientes');
  const sel = document.getElementById('f-cliente');
  sel.innerHTML = clientesCache.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
}

function nombreCliente(id){
  const c = clientesCache.find(x => x.id === id);
  return c ? c.nombre : '—';
}

async function cargarFiados(){
  const fiados = await api('/fiados');
  document.getElementById('tabla-fiados').innerHTML = fiados.map(f => `
    <tr>
      <td>${nombreCliente(f.cliente_id)}</td>
      <td>${f.descripcion}</td>
      <td>L. ${f.saldo.toFixed(2)}</td>
      <td>${f.dias_mora > 0 ? `<span class="mora">${f.dias_mora} días</span>` : '—'}</td>
      <td><span class="badge ${f.estado}">${f.estado}</span></td>
      <td>${f.estado !== 'pagado' ? `<button class="secondary" data-pagar="${f.id}">Abonar</button>` : ''}</td>
    </tr>`).join('') || '<tr><td colspan="6">Sin fiados registrados todavía.</td></tr>';
}

// Delegacion de eventos: CSP no permite atributos onclick inline.
document.getElementById('tabla-fiados').addEventListener('click', e => {
  const id = e.target.getAttribute('data-pagar');
  if (id) pagar(Number(id));
});

async function cargarTodo(){
  await cargarClientes();
  await cargarFiados();
}

window.addEventListener('offline', () => document.getElementById('offline-banner').classList.remove('hidden'));
window.addEventListener('online', () => document.getElementById('offline-banner').classList.add('hidden'));

// Precarga las credenciales de la cuenta demo, si el servidor tiene una
// configurada. Antes venian escritas en el value= del HTML; ahora salen de
// DEMO_EMAIL/DEMO_PASSWORD, asi que retirar la demo es borrar dos variables
// de entorno y no editar tres archivos.
async function precargarDemo(){
  try {
    const res = await fetch(API + '/publico/demo', { credentials: 'same-origin' });
    if (!res.ok) return;
    const { email, password } = await res.json();
    const inEmail = document.getElementById('login-email');
    const inPass = document.getElementById('login-password');
    if (inEmail && !inEmail.value) inEmail.value = email;
    if (inPass && !inPass.value) inPass.value = password;
  } catch { /* sin demo configurada: el formulario queda vacio */ }
}

// El boton de Google solo se muestra si el servidor tiene la integracion
// configurada; asi no se ofrece un camino que terminaria en error.
async function prepararGoogle(){
  try {
    const res = await fetch(API + '/auth/google/disponible', { credentials: 'same-origin' });
    if (!res.ok) return;
    const { disponible } = await res.json();
    if (disponible) document.getElementById('google-bloque').classList.remove('hidden');
  } catch { /* se queda oculto */ }
}

// El callback de Google redirige con ?error= cuando algo falla (por ejemplo
// una cuenta sin acceso). Se muestra en el mismo recuadro del formulario.
function mostrarErrorDeUrl(){
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  if (!error) return;

  const box = document.getElementById('login-error');
  box.textContent = error;
  box.classList.remove('hidden');
  // Se limpia la URL para que al recargar no reaparezca el mensaje.
  window.history.replaceState({}, '', window.location.pathname);
}

// Verifica sesion existente al cargar
(async () => {
  try {
    await api('/clientes');
    showApp();
  } catch {
    showLogin();
    mostrarErrorDeUrl();
    precargarDemo();
    prepararGoogle();
  }
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
