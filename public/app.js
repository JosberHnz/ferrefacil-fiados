const API = '/api';
let clientesCache = [];
let usuarioActual = null;
const ROLES_ADMIN = new Set(['admin', 'super_admin']);

function escapeHtml(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function nuevaClave(){
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Date.now() + '-' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// ===================== UI: toasts y modales (reemplazan alert/prompt/confirm) =====================

const ICONO_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>';
const ICONO_ERROR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';

function toast(mensaje, tipo = 'ok'){
  let cont = document.getElementById('toast-container');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'toast-container';
    cont.className = 'toast-container';
    document.body.appendChild(cont);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${tipo}`;
  t.innerHTML = (tipo === 'ok' ? ICONO_OK : ICONO_ERROR) + `<span>${escapeHtml(mensaje)}</span>`;
  cont.appendChild(t);
  requestAnimationFrame(() => t.classList.add('visible'));
  setTimeout(() => {
    t.classList.remove('visible');
    setTimeout(() => t.remove(), 300);
  }, 3800);
}

/** Modal con uno o varios campos. Devuelve un objeto {campo: valor} o null si se cancela. */
function abrirModal({ titulo, campos, textoConfirmar = 'Guardar' }){
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const box = document.createElement('div');
    box.className = 'modal-box';

    const h = document.createElement('h3');
    h.textContent = titulo;
    box.appendChild(h);

    const inputs = {};
    campos.forEach(c => {
      const label = document.createElement('label');
      label.className = 'modal-label';
      label.textContent = c.label;

      const input = document.createElement(c.tipo === 'textarea' ? 'textarea' : 'input');
      if (c.tipo && c.tipo !== 'textarea') input.type = c.tipo;
      if (c.placeholder) input.placeholder = c.placeholder;
      if (c.valor) input.value = c.valor;
      inputs[c.nombre] = input;

      label.appendChild(input);
      box.appendChild(label);
    });

    const acciones = document.createElement('div');
    acciones.className = 'modal-acciones';

    const btnCancelar = document.createElement('button');
    btnCancelar.type = 'button';
    btnCancelar.className = 'secondary';
    btnCancelar.textContent = 'Cancelar';

    const btnOk = document.createElement('button');
    btnOk.type = 'button';
    btnOk.textContent = textoConfirmar;

    acciones.appendChild(btnCancelar);
    acciones.appendChild(btnOk);
    box.appendChild(acciones);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function cerrar(valor){
      overlay.remove();
      resolve(valor);
    }

    btnCancelar.addEventListener('click', () => cerrar(null));
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(null); });
    btnOk.addEventListener('click', () => {
      const valores = {};
      for (const k in inputs) valores[k] = inputs[k].value;
      cerrar(valores);
    });

    const primero = Object.values(inputs)[0];
    if (primero) setTimeout(() => primero.focus(), 30);
  });
}

/** Modal de confirmacion simple. Devuelve true/false. */
function confirmarModal(mensaje){
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const box = document.createElement('div');
    box.className = 'modal-box modal-box-sm';

    const p = document.createElement('p');
    p.textContent = mensaje;
    box.appendChild(p);

    const acciones = document.createElement('div');
    acciones.className = 'modal-acciones';

    const btnCancelar = document.createElement('button');
    btnCancelar.type = 'button';
    btnCancelar.className = 'secondary';
    btnCancelar.textContent = 'Cancelar';

    const btnOk = document.createElement('button');
    btnOk.type = 'button';
    btnOk.className = 'danger';
    btnOk.textContent = 'Confirmar';

    acciones.appendChild(btnCancelar);
    acciones.appendChild(btnOk);
    box.appendChild(acciones);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    btnCancelar.addEventListener('click', () => { overlay.remove(); resolve(false); });
    btnOk.addEventListener('click', () => { overlay.remove(); resolve(true); });
    overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
  });
}

// ===================== resto de la app =====================

async function conBoton(id, fn){
  const btn = document.getElementById(id);
  if (btn.disabled) return;
  const contenidoOriginal = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  try { await fn(); }
  catch (e) { toast(e.message || 'No se pudo completar la operacion', 'error'); }
  finally { btn.disabled = false; btn.innerHTML = contenidoOriginal; }
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
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    usuarioActual = data.user;
    showApp();
  } catch (err) {
    errBox.innerHTML = ICONO_ERROR + '<span>Correo o contraseña incorrectos</span>';
    errBox.classList.remove('hidden');
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await fetch(API + '/auth/logout', { method: 'POST' });
  usuarioActual = null;
  showLogin();
});

document.getElementById('btn-feedback').addEventListener('click', () =>
  conBoton('btn-feedback', async () => {
    const r = await abrirModal({
      titulo: 'Dejar un comentario',
      campos: [{ nombre: 'mensaje', tipo: 'textarea', label: '¿Qué comentario querés dejar sobre la app?', placeholder: 'Escribí acá...' }],
      textoConfirmar: 'Enviar'
    });
    if (!r || !r.mensaje.trim()) return;
    await api('/feedback', {
      method: 'POST', clave: nuevaClave(),
      body: JSON.stringify({ mensaje: r.mensaje.trim() })
    });
    toast('¡Gracias! Tu comentario fue enviado.');
  }));

document.getElementById('btn-crear-cliente').addEventListener('click', () =>
  conBoton('btn-crear-cliente', async () => {
    const nombre = document.getElementById('c-nombre').value.trim();
    const telefono = document.getElementById('c-telefono').value.trim();
    if (!nombre) return toast('El nombre es requerido', 'error');
    await api('/clientes', {
      method: 'POST', clave: nuevaClave(),
      body: JSON.stringify({ nombre, telefono })
    });
    document.getElementById('c-nombre').value = '';
    document.getElementById('c-telefono').value = '';
    toast('Cliente agregado correctamente.');
    await cargarClientes();
  }));

document.getElementById('btn-crear-fiado').addEventListener('click', () =>
  conBoton('btn-crear-fiado', async () => {
    const cliente_id = document.getElementById('f-cliente').value;
    const descripcion = document.getElementById('f-desc').value.trim();
    const monto = document.getElementById('f-monto').value;
    const fecha_vencimiento = document.getElementById('f-vence').value;
    if (!cliente_id || !descripcion || !monto || !fecha_vencimiento) return toast('Completá todos los campos', 'error');
    await api('/fiados', {
      method: 'POST', clave: nuevaClave(),
      body: JSON.stringify({ cliente_id, descripcion, monto, fecha_vencimiento })
    });
    document.getElementById('f-desc').value = '';
    document.getElementById('f-monto').value = '';
    toast('Fiado registrado correctamente.');
    await cargarFiados();
  }));

const abonosEnCurso = new Set();

async function pagar(fiadoId){
  if (abonosEnCurso.has(fiadoId)) return;

  const r = await abrirModal({
    titulo: 'Registrar abono',
    campos: [{ nombre: 'monto', tipo: 'number', label: '¿Cuánto se abona? (L.)', placeholder: '0.00' }],
    textoConfirmar: 'Abonar'
  });
  if (!r || !r.monto) return;

  abonosEnCurso.add(fiadoId);
  const boton = document.querySelector(`[data-pagar="${fiadoId}"]`);
  if (boton) boton.disabled = true;

  try {
    await api(`/fiados/${fiadoId}/pagos`, {
      method: 'POST', clave: nuevaClave(),
      body: JSON.stringify({ monto: Number(r.monto) })
    });
    toast('Abono registrado.');
    await cargarFiados();
  } catch (e) {
    toast(e.message || 'No se pudo registrar el abono', 'error');
    if (boton) boton.disabled = false;
  } finally {
    abonosEnCurso.delete(fiadoId);
  }
}

async function cargarClientes(){
  clientesCache = await api('/clientes');
  const sel = document.getElementById('f-cliente');
  sel.innerHTML = clientesCache.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
}

function nombreCliente(id){
  const c = clientesCache.find(x => x.id === id);
  return c ? c.nombre : '—';
}

function paramsFiltroFiados(){
  const buscar = document.getElementById('filtro-buscar').value.trim();
  const estado = document.getElementById('filtro-estado').value;
  const params = new URLSearchParams();
  if (buscar) params.set('buscar', buscar);
  if (estado) params.set('estado', estado);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function cargarFiados(){
  const fiados = await api('/fiados' + paramsFiltroFiados());
  document.getElementById('tabla-fiados').innerHTML = fiados.map(f => `
    <tr>
      <td>${escapeHtml(f.cliente_nombre || nombreCliente(f.cliente_id))}</td>
      <td>${escapeHtml(f.descripcion)}</td>
      <td>L. ${f.saldo.toFixed(2)}</td>
      <td>${f.dias_mora > 0 ? `<span class="mora">${f.dias_mora} días</span>` : '—'}</td>
      <td><span class="badge ${f.estado}">${f.estado}</span></td>
      <td>${f.estado !== 'pagado' ? `<button class="secondary small" data-pagar="${f.id}">Abonar</button>` : ''}</td>
    </tr>`).join('') || '<tr><td colspan="6"><div class="vacio">Sin fiados que coincidan con la búsqueda.</div></td></tr>';
}

document.getElementById('tabla-fiados').addEventListener('click', e => {
  const id = e.target.dataset.pagar;
  if (id) pagar(Number(id));
});

let filtroTimeout;
document.getElementById('filtro-buscar').addEventListener('input', () => {
  clearTimeout(filtroTimeout);
  filtroTimeout = setTimeout(cargarFiados, 300);
});
document.getElementById('filtro-estado').addEventListener('change', cargarFiados);
document.getElementById('btn-limpiar-filtros').addEventListener('click', () => {
  document.getElementById('filtro-buscar').value = '';
  document.getElementById('filtro-estado').value = '';
  cargarFiados();
});

// ===================== PANEL DE ADMINISTRACION =====================

function esAdmin(){
  return usuarioActual && ROLES_ADMIN.has(usuarioActual.rol);
}

function mostrarPanelAdminSiCorresponde(){
  const badge = document.getElementById('rol-badge');
  const badgeTexto = document.getElementById('rol-badge-texto');
  const panel = document.getElementById('panel-admin');

  if (!usuarioActual) { badge.classList.add('hidden'); panel.classList.add('hidden'); return; }

  badgeTexto.textContent = usuarioActual.rol.replace('_', ' ');
  badge.classList.remove('hidden');

  if (esAdmin()) {
    panel.classList.remove('hidden');
    cargarDashboard();
  } else {
    panel.classList.add('hidden');
  }
}

document.querySelectorAll('.tabs button[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button[data-tab]').forEach(b => b.classList.remove('activo'));
    btn.classList.add('activo');
    document.getElementById('tab-dashboard').classList.add('hidden');
    document.getElementById('tab-tickets').classList.add('hidden');
    document.getElementById('tab-feedback').classList.add('hidden');

    const destino = document.getElementById(`tab-${btn.dataset.tab}`);
    destino?.classList.remove('hidden');

    if (btn.dataset.tab === 'dashboard') cargarDashboard();
    if (btn.dataset.tab === 'tickets') cargarTickets();
    if (btn.dataset.tab === 'feedback') cargarFeedbackAdmin();
  });
});

function crearStatBox(valor, etiqueta, alerta) {
  const box = document.createElement('div');
  box.className = alerta ? 'stat-box alerta' : 'stat-box';

  const b = document.createElement('b');
  b.textContent = String(valor);

  const span = document.createElement('span');
  span.textContent = etiqueta;

  box.appendChild(b);
  box.appendChild(span);
  return box;
}

const COLOR_ESTADO = { pendiente: '#B08B2E', parcial: '#3A5687', pagado: '#2C6A51' };

function pintarChartFiados(porEstado){
  const cont = document.getElementById('chart-fiados');
  cont.innerHTML = '';
  const max = Math.max(1, ...porEstado.map(f => f.n));

  porEstado.forEach(f => {
    const col = document.createElement('div');
    col.className = 'chart-bar-col';

    const valor = document.createElement('div');
    valor.className = 'chart-bar-value';
    valor.textContent = f.n;

    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.style.height = '0%';
    bar.style.background = COLOR_ESTADO[f.estado] || '#5D6C7B';

    const label = document.createElement('div');
    label.className = 'chart-bar-label';
    label.textContent = f.estado;

    col.appendChild(valor);
    col.appendChild(bar);
    col.appendChild(label);
    cont.appendChild(col);

    // Se anima despues de montar el elemento, para que la transicion CSS
    // se note (pasar de altura 0 a la real en el siguiente frame).
    requestAnimationFrame(() => { bar.style.height = `${Math.max(6, (f.n / max) * 100)}%`; });
  });
}

function pintarTopDeudores(lista){
  const cont = document.getElementById('top-deudores');
  cont.innerHTML = '';
  if (!lista.length) {
    cont.innerHTML = '<div class="vacio">Ningún cliente tiene deuda pendiente. ¡Excelente!</div>';
    return;
  }
  lista.forEach((d, i) => {
    const fila = document.createElement('div');
    fila.className = 'deudor-row';

    const izq = document.createElement('div');
    izq.className = 'deudor-nombre';
    const rank = document.createElement('span');
    rank.className = 'deudor-rank';
    rank.textContent = String(i + 1);
    const nombre = document.createElement('span');
    nombre.textContent = d.nombre;
    izq.appendChild(rank);
    izq.appendChild(nombre);

    const monto = document.createElement('b');
    monto.textContent = `L. ${Number(d.deuda).toFixed(2)}`;

    fila.appendChild(izq);
    fila.appendChild(monto);
    cont.appendChild(fila);
  });
}

function pintarActividad(items){
  const cont = document.getElementById('actividad-reciente');
  cont.innerHTML = '';
  if (!items.length) {
    cont.innerHTML = '<div class="vacio">Sin actividad registrada todavía.</div>';
    return;
  }
  items.forEach(a => {
    const fila = document.createElement('div');
    fila.className = 'actividad-item';

    const izq = document.createElement('span');
    const tipo = document.createElement('span');
    tipo.className = `actividad-tipo ${a.tipo}`;
    tipo.textContent = a.tipo === 'fiado' ? 'nuevo fiado' : 'abono';
    izq.appendChild(tipo);
    izq.append(` ${a.cliente} · ${a.detalle}`);

    const der = document.createElement('b');
    der.textContent = `L. ${Number(a.monto).toFixed(2)}`;

    fila.appendChild(izq);
    fila.appendChild(der);
    cont.appendChild(fila);
  });
}

function avisarMoraCriticaSiCorresponde(cantidad){
  if (cantidad <= 0 || !('Notification' in window)) return;

  const mostrar = () => new Notification('Fiados Ferrefacil', {
    body: `Tenés ${cantidad} fiado(s) con más de 15 días de mora.`,
    icon: '/icons/icon-192.png'
  });

  if (Notification.permission === 'granted') {
    mostrar();
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => { if (p === 'granted') mostrar(); });
  }
}

async function cargarDashboard(){
  try {
    const s = await api('/admin/stats');
    const grid = document.getElementById('stats-grid');
    grid.innerHTML = '';

    grid.appendChild(crearStatBox(s.total_clientes, 'clientes'));
    grid.appendChild(crearStatBox(s.tickets_abiertos, 'tickets abiertos'));
    grid.appendChild(crearStatBox(s.total_feedback, 'comentarios recibidos'));
    grid.appendChild(crearStatBox(s.mora_promedio_dias, 'días de mora (promedio)'));
    grid.appendChild(crearStatBox(s.mora_critica_count, 'fiados en mora crítica', s.mora_critica_count > 0));

    pintarChartFiados(s.fiados_por_estado);
    pintarTopDeudores(s.top_deudores);
    pintarActividad(s.actividad_reciente);
    avisarMoraCriticaSiCorresponde(s.mora_critica_count);
  } catch (e) { /* si no es admin, la ruta ya no se ve */ }
}

async function cargarTickets(){
  const tickets = await api('/admin/tickets');
  document.getElementById('tabla-tickets').innerHTML = tickets.map(t => `
    <tr>
      <td>${new Date(t.creado_en).toLocaleString('es-HN')}</td>
      <td>${escapeHtml(t.mensaje)}${t.diagnostico ? `<div class="diag-box">Diagnóstico: ${escapeHtml(t.diagnostico)}</div>` : ''}</td>
      <td>${escapeHtml(t.ruta || '—')}</td>
      <td><span class="badge ${t.estado}">${t.estado.replace('_',' ')}</span></td>
      <td>${t.estado !== 'resuelto' ? `<button class="secondary small" data-resolver="${t.id}">Marcar resuelto</button>` : ''}</td>
    </tr>`).join('') || '<tr><td colspan="5"><div class="vacio">Sin tickets registrados. ¡Buena señal!</div></td></tr>';
}

document.getElementById('tabla-tickets').addEventListener('click', async e => {
  const id = e.target.dataset.resolver;
  if (!id) return;
  const r = await abrirModal({
    titulo: 'Resolver ticket',
    campos: [{ nombre: 'diagnostico', tipo: 'textarea', label: 'Diagnóstico (qué causó el error, qué se hizo)', placeholder: 'Escribí acá...' }],
    textoConfirmar: 'Marcar resuelto'
  });
  if (!r) return;
  await api(`/admin/tickets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ estado: 'resuelto', diagnostico: r.diagnostico || '' })
  });
  toast('Ticket marcado como resuelto.');
  cargarTickets();
});

async function cargarFeedbackAdmin(){
  const items = await api('/admin/feedback');
  document.getElementById('tabla-feedback').innerHTML = items.map(f => `
    <tr>
      <td>${new Date(f.creado_en).toLocaleString('es-HN')}</td>
      <td>${escapeHtml(f.usuario_email)}</td>
      <td>${escapeHtml(f.mensaje)}</td>
    </tr>`).join('') || '<tr><td colspan="3"><div class="vacio">Todavía no hay comentarios.</div></td></tr>';
}

async function cargarTodo(){
  await cargarClientes();
  await cargarFiados();
  mostrarPanelAdminSiCorresponde();
}

window.addEventListener('offline', () => document.getElementById('offline-banner').classList.remove('hidden'));
window.addEventListener('online', () => document.getElementById('offline-banner').classList.add('hidden'));

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

async function prepararGoogle(){
  try {
    const res = await fetch(API + '/auth/google/disponible', { credentials: 'same-origin' });
    if (!res.ok) return;
    const { disponible } = await res.json();
    if (disponible) document.getElementById('google-bloque').classList.remove('hidden');
  } catch { /* se queda oculto */ }
}

function mostrarErrorDeUrl(){
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  if (!error) return;

  const box = document.getElementById('login-error');
  box.innerHTML = ICONO_ERROR + `<span>${escapeHtml(error)}</span>`;
  box.classList.remove('hidden');
  window.history.replaceState({}, '', window.location.pathname);
}

(async () => {
  try {
    const data = await api('/auth/me');
    usuarioActual = data.user;
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