const API = '/api';
let clientesCache = [];
let usuarioActual = null;
const ROLES_ADMIN = new Set(['admin', 'super_admin']);

// Quien pide menos movimiento en su sistema no recibe contadores ni trazos
// animados: las cifras aparecen directamente con su valor final.
const MOVIMIENTO_REDUCIDO = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

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

// ===================== formatos =====================

const FORMATO_LEMPIRAS = new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FORMATO_ENTERO = new Intl.NumberFormat('es-HN', { maximumFractionDigits: 0 });

function lempiras(valor){ return 'L. ' + FORMATO_LEMPIRAS.format(Number(valor) || 0); }
function entero(valor){ return FORMATO_ENTERO.format(Math.round(Number(valor) || 0)); }
function porcentaje(parte, total){ return total > 0 ? Math.round((parte / total) * 100) : 0; }
function capitalizar(texto){ return texto.charAt(0).toUpperCase() + texto.slice(1); }

// ===================== UI: toasts y modales (reemplazan alert/prompt/confirm) =====================

const ICONO_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>';
const ICONO_ERROR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
const ICONO_CLIENTES = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>';
const ICONO_RELOJ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
const ICONO_ALERTA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>';
const ICONO_TICKET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9a3 3 0 000 6v3a2 2 0 002 2h14a2 2 0 002-2v-3a3 3 0 010-6V6a2 2 0 00-2-2H5a2 2 0 00-2 2z"/><path d="M13 5v2M13 17v2M13 11v2"/></svg>';
const ICONO_COMENTARIO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
const ICONO_CARRITO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6"/></svg>';
const ICONO_MONEDA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>';

const ICONO_BOMBILLA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z"/></svg>';
const ICONO_CHECK_CIRCULO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.1V12a10 10 0 11-5.9-9.1"/><path d="M22 4L12 14l-3-3"/></svg>';
const ICONO_TENDENCIA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></svg>';
const ICONO_CAJA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/></svg>';
const ICONO_LLUVIA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 16.6A5 5 0 0018 7h-1.3A8 8 0 104 15.3"/><path d="M8 19v2M8 13v2M16 19v2M16 13v2M12 21v2M12 15v2"/></svg>';
const ICONO_REGLA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.3 8.7L8.7 21.3a1 1 0 01-1.4 0l-4.6-4.6a1 1 0 010-1.4L15.3 2.7a1 1 0 011.4 0l4.6 4.6a1 1 0 010 1.4z"/><path d="M7.5 10.5l2 2M10.5 7.5l2 2M13.5 4.5l2 2M4.5 13.5l2 2"/></svg>';
const ICONO_ESCUDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>';
const ICONO_MALETIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>';
const ICONO_PAUSA = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
const ICONO_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3l14 9-14 9V3z"/></svg>';

const IMG_TODO_AL_DIA = '/img/vacio-todo-al-dia.svg';

// El icono (constante fija, sin datos externos) y el mensaje (variable) se
// insertan por separado: el icono via innerHTML porque nunca cambia, el
// mensaje via textContent porque es la unica forma de garantizar, sin
// depender de ningun sanitizador propio, que un mensaje de error nunca se
// interprete como HTML.
function iconoElemento(svg){
  const span = document.createElement('span');
  span.innerHTML = svg;
  return span;
}

function crearSpinner(){
  const spinner = document.createElement('span');
  spinner.className = 'spinner';
  spinner.setAttribute('aria-hidden', 'true');
  return spinner;
}

/** Ejecuta fn dos cuadros despues: el navegador ya pinto el estado inicial y la transicion se ve. */
function trasPintar(fn){
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

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

  const texto = document.createElement('span');
  texto.textContent = mensaje;

  t.appendChild(iconoElemento(tipo === 'ok' ? ICONO_OK : ICONO_ERROR));
  t.appendChild(texto);
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

/** Sacude la tarjeta para señalar un error; se omite con movimiento reducido. */
function sacudir(el){
  if (!el || MOVIMIENTO_REDUCIDO) return;
  el.classList.remove('sacudir');
  // Leer offsetWidth fuerza a reiniciar la animacion si ya se estaba sacudiendo.
  el.getBoundingClientRect();
  el.classList.add('sacudir');
  el.addEventListener('animationend', () => el.classList.remove('sacudir'), { once: true });
}

/** Lleva un numero desde su valor anterior hasta el nuevo, con desaceleracion. */
function animarNumero(el, destino, formato = entero){
  const final = Number(destino) || 0;
  const desde = Number(el.dataset.valor || 0);
  el.dataset.valor = String(final);

  if (MOVIMIENTO_REDUCIDO || desde === final) {
    el.textContent = formato(final);
    return;
  }

  const inicio = performance.now();
  const duracion = 1100;
  const paso = ahora => {
    const t = Math.min(1, (ahora - inicio) / duracion);
    const suavizado = 1 - Math.pow(1 - t, 3);
    el.textContent = formato(desde + (final - desde) * suavizado);
    if (t < 1 && el.dataset.valor === String(final)) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

// ===================== resto de la app =====================

async function conBoton(id, fn){
  const btn = document.getElementById(id);
  if (btn.disabled) return;
  const contenidoOriginal = btn.innerHTML;
  btn.disabled = true;
  btn.replaceChildren(crearSpinner(), 'Guardando...');
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
    headers: { ...headers, ...opts.headers }
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

function mostrarErrorLogin(mensaje){
  const errBox = document.getElementById('login-error');
  errBox.innerHTML = '';
  const texto = document.createElement('span');
  texto.textContent = mensaje;
  errBox.appendChild(iconoElemento(ICONO_ERROR));
  errBox.appendChild(texto);
  errBox.classList.remove('hidden');
}

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const boton = e.target.querySelector('button[type="submit"]');
  const textoOriginal = boton.textContent;

  document.getElementById('login-error').classList.add('hidden');
  boton.disabled = true;
  boton.replaceChildren(crearSpinner(), 'Entrando...');

  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    usuarioActual = data.user;
    showApp();
  } catch {
    // A proposito no se distingue el motivo (correo inexistente o clave
    // incorrecta): decir cual fue le daria pistas a quien prueba cuentas.
    mostrarErrorLogin('Correo o contraseña incorrectos');
    sacudir(document.querySelector('.login-card'));
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
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
    if (!r?.mensaje.trim()) return;
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
  if (!r?.monto) return;

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

// Mas de 15 dias de mora es "critica", el mismo umbral que usa el dashboard.
const DIAS_MORA_CRITICA = 15;

function celdaMora(dias){
  if (dias <= 0) return '—';
  const clase = dias > DIAS_MORA_CRITICA ? 'mora critica' : 'mora';
  return `<span class="${clase}">${dias} días</span>`;
}

async function cargarFiados(){
  const fiados = await api('/fiados' + paramsFiltroFiados());
  document.getElementById('tabla-fiados').innerHTML = fiados.map(f => `
    <tr>
      <td>${escapeHtml(f.cliente_nombre || nombreCliente(f.cliente_id))}</td>
      <td>${escapeHtml(f.descripcion)}</td>
      <td>${lempiras(f.saldo)}</td>
      <td>${celdaMora(f.dias_mora)}</td>
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

/**
 * Coloca la "pastilla" de fondo debajo del boton activo de un grupo
 * (pestanas o control segmentado). Al cambiar de boton, la transicion CSS
 * la desliza hasta su nueva posicion.
 */
function moverPastilla(grupo){
  const pastilla = grupo.querySelector('.pastilla');
  const activo = grupo.querySelector('button.activo');
  if (!pastilla || !activo?.offsetWidth) return;

  pastilla.style.width = `${activo.offsetWidth}px`;
  pastilla.style.height = `${activo.offsetHeight}px`;
  pastilla.style.transform = `translate(${activo.offsetLeft}px, ${activo.offsetTop}px)`;

  // La transicion se activa despues de la primera colocacion: si no, la
  // pastilla entraria deslizandose desde la esquina al abrir el panel.
  if (!grupo.classList.contains('con-pastilla')) {
    grupo.classList.add('con-pastilla');
    trasPintar(() => pastilla.classList.add('lista'));
  }
}

function moverTodasLasPastillas(){
  document.querySelectorAll('.tabs, .segmentado').forEach(moverPastilla);
}

window.addEventListener('resize', moverTodasLasPastillas);
document.fonts?.ready.then(moverTodasLasPastillas);

function mostrarPanelAdminSiCorresponde(){
  const badge = document.getElementById('rol-badge');
  const badgeTexto = document.getElementById('rol-badge-texto');
  const panel = document.getElementById('panel-admin');

  if (!usuarioActual) { badge.classList.add('hidden'); panel.classList.add('hidden'); return; }

  badgeTexto.textContent = usuarioActual.rol.replace('_', ' ');
  badge.classList.remove('hidden');

  if (esAdmin()) {
    panel.classList.remove('hidden');
    trasPintar(moverTodasLasPastillas);
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
    moverTodasLasPastillas();

    if (btn.dataset.tab === 'dashboard') cargarDashboard();
    if (btn.dataset.tab === 'tickets') cargarTickets();
    if (btn.dataset.tab === 'feedback') cargarFeedbackAdmin();
  });
});

// ---------- tooltip compartido por todas las graficas ----------

let tooltipEl = null;

/**
 * Muestra el tooltip junto al puntero. Cada fila es { color, valor, etiqueta }:
 * el valor va primero y resaltado porque es lo que el lector busca; la
 * etiqueta y el color ya los conoce por la leyenda. Todo entra con
 * textContent: los nombres de clientes vienen de la base.
 */
function mostrarTooltip(x, y, titulo, filas){
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'viz-tooltip';
    tooltipEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tooltipEl);
  }

  const cabeza = document.createElement('div');
  cabeza.className = 'tt-titulo';
  cabeza.textContent = titulo;
  tooltipEl.replaceChildren(cabeza);

  filas.forEach(f => {
    const fila = document.createElement('div');
    fila.className = 'tt-fila';
    const clave = document.createElement('i');
    clave.style.background = f.color;
    const valor = document.createElement('b');
    valor.textContent = f.valor;
    const etiqueta = document.createElement('span');
    etiqueta.textContent = f.etiqueta;
    fila.append(clave, valor, etiqueta);
    tooltipEl.appendChild(fila);
  });

  const { offsetWidth: ancho, offsetHeight: alto } = tooltipEl;
  let left = x + 14;
  let top = y - alto - 12;
  if (left + ancho > window.innerWidth - 8) left = x - ancho - 14;
  if (left < 8) left = 8;
  if (top < 8) top = y + 18;
  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
  tooltipEl.classList.add('visible');
}

function ocultarTooltip(){
  tooltipEl?.classList.remove('visible');
}

function estadoVacio(texto, imagen, etiqueta = 'li'){
  const el = document.createElement(etiqueta);
  el.className = 'vacio';
  if (imagen) {
    const img = document.createElement('img');
    img.src = imagen;
    img.alt = '';
    img.width = 120;
    img.height = 90;
    el.appendChild(img);
  }
  el.append(texto);
  return el;
}

// ---------- cifra principal y KPIs ----------

const FORMATO_FECHA_HOY = new Intl.DateTimeFormat('es-HN', { weekday: 'long', day: 'numeric', month: 'long' });

function pintarHero(s){
  document.getElementById('dash-fecha').textContent = FORMATO_FECHA_HOY.format(new Date());

  const cartera = s.cartera || { saldo_pendiente: 0, fiados_abiertos: 0 };
  animarNumero(document.getElementById('dash-hero-valor'), cartera.saldo_pendiente, lempiras);
  document.getElementById('dash-hero-detalle').textContent =
    cartera.fiados_abiertos === 1 ? 'en 1 fiado abierto' : `en ${entero(cartera.fiados_abiertos)} fiados abiertos`;
}

function crearKpi({ i, etiqueta, valor, unidad, icono, pie, critico, medidor }){
  const box = document.createElement('div');
  box.className = critico ? 'kpi critico' : 'kpi';
  box.style.setProperty('--i', i);

  const cabeza = document.createElement('div');
  cabeza.className = 'kpi-cabeza';
  const label = document.createElement('span');
  label.className = 'kpi-label';
  label.textContent = etiqueta;
  const ic = iconoElemento(icono);
  ic.className = 'kpi-icono';
  ic.setAttribute('aria-hidden', 'true');
  cabeza.append(label, ic);

  const cifra = document.createElement('div');
  cifra.className = 'kpi-valor';
  const numero = document.createElement('span');
  cifra.appendChild(numero);
  if (unidad) {
    const u = document.createElement('span');
    u.className = 'kpi-unidad';
    u.textContent = unidad;
    cifra.appendChild(u);
  }
  box.append(cabeza, cifra);

  if (medidor != null) {
    const pista = document.createElement('div');
    pista.className = 'medidor';
    pista.setAttribute('role', 'meter');
    pista.setAttribute('aria-valuemin', '0');
    pista.setAttribute('aria-valuemax', '100');
    pista.setAttribute('aria-valuenow', String(medidor));
    pista.setAttribute('aria-label', `${medidor}% de los fiados abiertos en mora crítica`);
    const relleno = document.createElement('span');
    pista.appendChild(relleno);
    box.appendChild(pista);
    trasPintar(() => { relleno.style.width = `${medidor}%`; });
  }

  if (pie) {
    const p = document.createElement('div');
    p.className = 'kpi-pie';
    p.textContent = pie;
    box.appendChild(p);
  }

  animarNumero(numero, valor);
  return box;
}

function pintarKpis(s){
  const grid = document.getElementById('kpi-grid');
  grid.replaceChildren();

  const abiertos = s.cartera?.fiados_abiertos || 0;
  const pctCritico = porcentaje(s.mora_critica_count, abiertos);

  const kpis = [
    { etiqueta: 'Clientes', valor: s.total_clientes, icono: ICONO_CLIENTES, pie: 'registrados en la cartera' },
    { etiqueta: 'Mora promedio', valor: s.mora_promedio_dias, unidad: 'días', icono: ICONO_RELOJ, pie: 'entre los fiados vencidos' },
    {
      etiqueta: 'Mora crítica', valor: s.mora_critica_count, unidad: s.mora_critica_count === 1 ? 'fiado' : 'fiados',
      icono: ICONO_ALERTA, critico: s.mora_critica_count > 0, medidor: pctCritico,
      pie: `${pctCritico}% de los abiertos · más de ${DIAS_MORA_CRITICA} días`
    },
    { etiqueta: 'Tickets abiertos', valor: s.tickets_abiertos, icono: ICONO_TICKET, pie: s.tickets_abiertos ? 'requieren revisión' : 'todo en orden' },
    { etiqueta: 'Comentarios', valor: s.total_feedback, icono: ICONO_COMENTARIO, pie: 'recibidos de los usuarios' }
  ];

  kpis.forEach((k, i) => grid.appendChild(crearKpi({ ...k, i })));
}

function pintarEsqueletoKpis(){
  const grid = document.getElementById('kpi-grid');
  grid.replaceChildren();
  for (let i = 0; i < 5; i++) {
    const kpi = document.createElement('div');
    kpi.className = 'kpi';
    kpi.style.setProperty('--i', i);
    const linea = document.createElement('div');
    linea.className = 'esqueleto';
    linea.style.cssText = 'height:12px;width:55%;margin-bottom:16px';
    const cifra = document.createElement('div');
    cifra.className = 'esqueleto';
    cifra.style.cssText = 'height:26px;width:40%';
    kpi.append(linea, cifra);
    grid.appendChild(kpi);
  }
}

// ---------- grafica de movimiento mensual (lineas) ----------

const SVG_NS = 'http://www.w3.org/2000/svg';
const MES_CORTO = new Intl.DateTimeFormat('es-HN', { month: 'short' });
const MES_LARGO = new Intl.DateTimeFormat('es-HN', { month: 'long', year: 'numeric' });

const SERIES_MOVIMIENTO = [
  { clave: 'fiado', etiqueta: 'Fiado', color: 'var(--serie-fiado)', clase: 'fiado' },
  { clave: 'abonado', etiqueta: 'Abonado', color: 'var(--serie-abono)', clase: 'abono' }
];

function svgEl(tag, attrs = {}){
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function redondear(v){ return Math.round(v * 10) / 10; }

function fechaDeMes(mes){
  const [anio, m] = mes.split('-').map(Number);
  return new Date(anio, m - 1, 1);
}

/** Tope y paso "redondos" para el eje Y (0 / 500 / 1,000...), nunca 0 / 437 / 874. */
function escalaLimpia(maximo){
  if (maximo <= 0) return { tope: 1000, paso: 250 };
  const bruto = maximo / 4;
  const magnitud = Math.pow(10, Math.floor(Math.log10(bruto)));
  const normal = bruto / magnitud;
  let factor = 10;
  if (normal <= 1) factor = 1;
  else if (normal <= 2) factor = 2;
  else if (normal <= 2.5) factor = 2.5;
  else if (normal <= 5) factor = 5;
  const paso = factor * magnitud;
  return { tope: paso * Math.ceil(maximo / paso), paso };
}

function compacto(v){
  if (v >= 1e6) return `${redondear(v / 1e6)}M`;
  if (v >= 1e3) return `${redondear(v / 1e3)}K`;
  return String(v);
}

/**
 * Curva suave que pasa por todos los puntos sin inventar picos: la
 * interpolacion monotona (Fritsch-Carlson) nunca sube por encima ni baja por
 * debajo de dos meses vecinos, a diferencia de una curva Bezier ingenua.
 */
function curvaMonotona(puntos){
  const n = puntos.length;
  if (n === 0) return '';
  if (n === 1) return `M${puntos[0][0]},${puntos[0][1]}`;

  const dx = [];
  const pendiente = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = puntos[i + 1][0] - puntos[i][0];
    pendiente[i] = (puntos[i + 1][1] - puntos[i][1]) / dx[i];
  }

  const t = [pendiente[0]];
  for (let i = 1; i < n - 1; i++) {
    t[i] = pendiente[i - 1] * pendiente[i] <= 0 ? 0 : (pendiente[i - 1] + pendiente[i]) / 2;
  }
  t[n - 1] = pendiente[n - 2];

  for (let i = 0; i < n - 1; i++) {
    if (pendiente[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / pendiente[i];
    const b = t[i + 1] / pendiente[i];
    const h = a * a + b * b;
    if (h > 9) {
      const s = 3 / Math.sqrt(h);
      t[i] = s * a * pendiente[i];
      t[i + 1] = s * b * pendiente[i];
    }
  }

  let d = `M${puntos[0][0]},${puntos[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const c = dx[i] / 3;
    d += ` C${redondear(puntos[i][0] + c)},${redondear(puntos[i][1] + c * t[i])}` +
         ` ${redondear(puntos[i + 1][0] - c)},${redondear(puntos[i + 1][1] - c * t[i + 1])}` +
         ` ${puntos[i + 1][0]},${puntos[i + 1][1]}`;
  }
  return d;
}

function pintarMovimiento(meses){
  const cont = document.getElementById('chart-movimiento');
  const tabla = document.getElementById('tabla-movimiento');
  cont.replaceChildren();
  tabla.replaceChildren();

  if (!meses.length) {
    cont.appendChild(estadoVacio('Todavía no hay movimiento para graficar.', null, 'div'));
    return;
  }

  // El SVG escala con su contenedor: con un viewBox fijo de 560px, en un
  // telefono los textos de los ejes quedarian en ~7px. Tomar el ancho real
  // mantiene las etiquetas a su tamano de diseno.
  const W = Math.round(Math.min(560, Math.max(300, cont.clientWidth || 560)));
  const H = W < 420 ? 220 : 250;
  const margen = { arriba: 16, derecha: 18, abajo: 30, izquierda: 44 };
  const ancho = W - margen.izquierda - margen.derecha;
  const alto = H - margen.arriba - margen.abajo;
  const maximo = Math.max(0, ...meses.flatMap(d => [d.fiado, d.abonado]));
  const { tope, paso } = escalaLimpia(maximo);
  const x = i => margen.izquierda + (meses.length === 1 ? ancho / 2 : (i * ancho) / (meses.length - 1));
  const y = v => margen.arriba + alto - (v / tope) * alto;
  const base = y(0);
  const nombreMes = d => capitalizar(MES_LARGO.format(fechaDeMes(d.mes)));

  const totalFiado = meses.reduce((a, d) => a + d.fiado, 0);
  const totalAbonado = meses.reduce((a, d) => a + d.abonado, 0);

  const raiz = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'viz-svg', role: 'img',
    'aria-label': `Movimiento de ${nombreMes(meses[0])} a ${nombreMes(meses.at(-1))}: ` +
      `${lempiras(totalFiado)} fiados y ${lempiras(totalAbonado)} abonados.`
  });

  // Solo la serie principal (lo fiado) lleva relleno: un lavado de su color
  // que se desvanece hacia el eje. Dos lavados encimados se mezclarian en un
  // tono turbio que no pertenece a ninguna de las dos series.
  const principal = SERIES_MOVIMIENTO[0];
  const defs = svgEl('defs');
  const degradado = svgEl('linearGradient', { id: 'grad-movimiento', x1: 0, y1: 0, x2: 0, y2: 1 });
  [[0, 0.2], [1, 0]].forEach(([offset, opacidad]) => {
    const stop = svgEl('stop', { offset, 'stop-opacity': opacidad });
    stop.style.stopColor = principal.color;
    degradado.appendChild(stop);
  });
  defs.appendChild(degradado);
  raiz.appendChild(defs);

  const grid = svgEl('g', { class: 'viz-grid' });
  for (let v = 0; v <= tope + paso / 2; v += paso) {
    const yv = redondear(y(v));
    if (v > 0) grid.appendChild(svgEl('line', { x1: margen.izquierda, x2: W - margen.derecha, y1: yv, y2: yv }));
    const etiqueta = svgEl('text', { x: margen.izquierda - 10, y: yv + 4, 'text-anchor': 'end' });
    etiqueta.textContent = compacto(v);
    grid.appendChild(etiqueta);
  }
  raiz.appendChild(grid);
  raiz.appendChild(svgEl('line', { class: 'viz-eje', x1: margen.izquierda, x2: W - margen.derecha, y1: base, y2: base }));

  meses.forEach((d, i) => {
    const etiqueta = svgEl('text', { x: redondear(x(i)), y: H - 8, 'text-anchor': 'middle' });
    etiqueta.textContent = capitalizar(MES_CORTO.format(fechaDeMes(d.mes)).replace('.', ''));
    raiz.appendChild(etiqueta);
  });

  const puntosSerie = SERIES_MOVIMIENTO.map(s => meses.map((d, i) => [redondear(x(i)), redondear(y(d[s.clave]))]));

  const ptsPrincipal = puntosSerie[0];
  raiz.appendChild(svgEl('path', {
    class: 'viz-relleno',
    fill: 'url(#grad-movimiento)',
    d: `${curvaMonotona(ptsPrincipal)} L${ptsPrincipal.at(-1)[0]},${base} L${ptsPrincipal[0][0]},${base} Z`
  }));

  SERIES_MOVIMIENTO.forEach((s, k) => {
    // pathLength=1 permite "dibujar" la linea animando stroke-dashoffset de 1 a 0.
    const linea = svgEl('path', { class: `viz-linea ${s.clase}`, d: curvaMonotona(puntosSerie[k]), pathLength: 1 });
    linea.style.stroke = s.color;
    raiz.appendChild(linea);
  });

  const cruz = svgEl('line', { class: 'viz-cruz', x1: 0, x2: 0, y1: margen.arriba, y2: base });
  raiz.appendChild(cruz);

  const puntos = [];
  SERIES_MOVIMIENTO.forEach((s, k) => {
    puntosSerie[k].forEach(([px, py], i) => {
      const punto = svgEl('circle', { class: 'viz-punto', cx: px, cy: py, r: 4 });
      punto.style.fill = s.color;
      punto.style.animationDelay = `${0.7 + i * 0.08 + k * 0.1}s`;
      punto.dataset.mes = String(i);
      puntos.push(punto);
      raiz.appendChild(punto);
    });
  });

  // Cada mes tiene una franja invisible de todo el alto: el lector apunta a
  // un mes, no a un punto de 8px. La cruz se engancha al mes mas cercano.
  const franja = meses.length > 1 ? ancho / (meses.length - 1) : ancho;
  const soltar = () => {
    cruz.classList.remove('visible');
    puntos.forEach(p => p.classList.remove('activo'));
    ocultarTooltip();
  };

  meses.forEach((d, i) => {
    const filas = SERIES_MOVIMIENTO.map(s => ({ color: s.color, valor: lempiras(d[s.clave]), etiqueta: s.etiqueta }));
    const resumen = filas.map(f => f.etiqueta + ' ' + f.valor).join(', ');
    const zona = svgEl('rect', {
      class: 'viz-zona', x: redondear(x(i) - franja / 2), y: margen.arriba, width: redondear(franja), height: alto,
      tabindex: 0, 'aria-label': `${nombreMes(d)}: ${resumen}`
    });
    const activar = (cx, cy) => {
      cruz.setAttribute('x1', redondear(x(i)));
      cruz.setAttribute('x2', redondear(x(i)));
      cruz.classList.add('visible');
      puntos.forEach(p => p.classList.toggle('activo', Number(p.dataset.mes) === i));
      mostrarTooltip(cx, cy, nombreMes(d), filas);
    };
    zona.addEventListener('pointermove', e => activar(e.clientX, e.clientY));
    zona.addEventListener('pointerdown', e => activar(e.clientX, e.clientY));
    zona.addEventListener('focus', () => {
      const caja = zona.getBoundingClientRect();
      activar(caja.left + caja.width / 2, caja.top + 30);
    });
    zona.addEventListener('pointerleave', soltar);
    zona.addEventListener('blur', soltar);
    raiz.appendChild(zona);

    const tr = document.createElement('tr');
    [nombreMes(d), lempiras(d.fiado), lempiras(d.abonado)].forEach(texto => {
      const td = document.createElement('td');
      td.textContent = texto;
      tr.appendChild(td);
    });
    tabla.appendChild(tr);
  });

  cont.appendChild(raiz);
}

// ---------- fiados por estado (barra apilada 100%) ----------

const ESTADOS = [
  { clave: 'pendiente', etiqueta: 'Pendiente', color: 'var(--estado-pendiente)' },
  { clave: 'parcial', etiqueta: 'Parcial', color: 'var(--estado-parcial)' },
  { clave: 'pagado', etiqueta: 'Pagado', color: 'var(--estado-pagado)' }
];
let modoEstados = 'n';
let ultimoPorEstado = [];

function crearSegmento(estado){
  const seg = document.createElement('div');
  seg.className = 'seg';
  seg.dataset.estado = estado.clave;
  seg.style.background = estado.color;

  // El tooltip lee los datos del propio segmento, asi refleja el modo
  // (cantidad o monto) que este activo en ese momento.
  const tip = (cx, cy) => mostrarTooltip(cx, cy, estado.etiqueta, [
    { color: estado.color, valor: seg.dataset.valor, etiqueta: seg.dataset.pct }
  ]);
  seg.addEventListener('pointermove', e => tip(e.clientX, e.clientY));
  seg.addEventListener('pointerleave', ocultarTooltip);
  return seg;
}

function etiquetaTotalEstados(porMonto, total){
  if (porMonto) return 'fiados en total';
  return total === 1 ? 'fiado registrado' : 'fiados registrados';
}

function valorDeEstado(fila, porMonto){
  if (!fila) return 0;
  return Number(porMonto ? fila.total : fila.n);
}

function pintarChartFiados(porEstado){
  ultimoPorEstado = porEstado;
  const porMonto = modoEstados === 'total';
  const formato = porMonto ? lempiras : entero;

  const datos = ESTADOS.map(e => ({ ...e, valor: valorDeEstado(porEstado.find(f => f.estado === e.clave), porMonto) }));
  const total = datos.reduce((a, d) => a + d.valor, 0);
  const visibles = datos.filter(d => d.valor > 0);

  animarNumero(document.getElementById('estado-total-valor'), total, formato);
  document.getElementById('estado-total-label').textContent = etiquetaTotalEstados(porMonto, total);
  document.getElementById('estado-sub').textContent =
    porMonto ? 'Monto original de los fiados en cada estado' : 'Cantidad de fiados en cada estado';

  // La barra es solo visual (aria-hidden en el HTML): los mismos valores se
  // leen como texto en la lista de estados que va debajo.
  const barra = document.getElementById('chart-fiados');
  barra.classList.toggle('vacia', total === 0);

  datos.forEach(d => {
    let seg = barra.querySelector(`[data-estado="${d.clave}"]`);
    if (!seg) {
      seg = crearSegmento(d);
      barra.appendChild(seg);
    }
    seg.dataset.valor = formato(d.valor);
    seg.dataset.pct = `${porcentaje(d.valor, total)}% del total`;
    seg.hidden = d.valor === 0;
    seg.classList.toggle('primero', d === visibles[0]);
    seg.classList.toggle('ultimo', d === visibles.at(-1));
    // flex-grow en porcentaje: los segmentos siempre suman el ancho completo
    // y, al cambiar de modo, cada uno se estira o encoge con transicion.
    const crecimiento = total > 0 ? (d.valor / total) * 100 : 0;
    trasPintar(() => { seg.style.flexGrow = String(crecimiento); });
  });

  const lista = document.getElementById('estado-lista');
  lista.replaceChildren();
  datos.forEach((d, i) => {
    const li = document.createElement('li');
    li.style.setProperty('--i', i);
    const muestra = document.createElement('i');
    muestra.style.background = d.color;
    const nombre = document.createElement('span');
    nombre.className = 'nombre';
    nombre.textContent = d.etiqueta;
    const valor = document.createElement('span');
    valor.className = 'valor';
    valor.textContent = formato(d.valor);
    const pct = document.createElement('span');
    pct.className = 'pct';
    pct.textContent = `${porcentaje(d.valor, total)}%`;
    li.append(muestra, nombre, valor, pct);
    lista.appendChild(li);
  });
}

document.getElementById('estado-modo').addEventListener('click', e => {
  const btn = e.target.closest('button[data-modo]');
  if (!btn || btn.dataset.modo === modoEstados) return;

  modoEstados = btn.dataset.modo;
  document.querySelectorAll('#estado-modo button[data-modo]').forEach(b => {
    const activo = b === btn;
    b.classList.toggle('activo', activo);
    b.setAttribute('aria-pressed', String(activo));
  });
  moverPastilla(document.getElementById('estado-modo'));
  pintarChartFiados(ultimoPorEstado);
});

// ---------- top deudores (barras horizontales) ----------

function iniciales(nombre){
  return String(nombre).trim().split(/\s+/).slice(0, 2).map(p => p.charAt(0).toUpperCase()).join('');
}

function pintarTopDeudores(lista, saldoTotal){
  const cont = document.getElementById('top-deudores');
  cont.replaceChildren();

  if (!lista.length) {
    cont.appendChild(estadoVacio('Ningún cliente tiene deuda pendiente. ¡Excelente!', IMG_TODO_AL_DIA));
    return;
  }

  const maximo = Math.max(...lista.map(d => d.deuda));

  lista.forEach((d, i) => {
    const li = document.createElement('li');
    li.style.setProperty('--i', i);

    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = iniciales(d.nombre);

    const cuerpo = document.createElement('div');
    const fila = document.createElement('div');
    fila.className = 'ranking-fila';
    const nombre = document.createElement('span');
    nombre.className = 'ranking-nombre';
    nombre.textContent = `${i + 1}. ${d.nombre}`;
    const valor = document.createElement('span');
    valor.className = 'ranking-valor';
    valor.textContent = lempiras(d.deuda);
    fila.append(nombre, valor);

    const pct = saldoTotal > 0 ? porcentaje(d.deuda, saldoTotal) : null;
    const detalle = pct == null ? 'deuda pendiente' : `${pct}% de la cartera pendiente`;
    const barra = document.createElement('div');
    barra.className = 'ranking-barra';
    barra.tabIndex = 0;
    barra.setAttribute('aria-label', `${d.nombre}: ${lempiras(d.deuda)}, ${detalle}`);

    // Toda la fila es zona de hover, no solo la barra de 10px.
    const tip = (cx, cy) => mostrarTooltip(cx, cy, d.nombre, [
      { color: 'var(--serie-fiado)', valor: lempiras(d.deuda), etiqueta: detalle }
    ]);
    li.addEventListener('pointermove', e => tip(e.clientX, e.clientY));
    li.addEventListener('pointerleave', ocultarTooltip);
    barra.addEventListener('focus', () => {
      const caja = barra.getBoundingClientRect();
      tip(caja.right, caja.top);
    });
    barra.addEventListener('blur', ocultarTooltip);

    cuerpo.append(fila, barra);
    li.append(avatar, cuerpo);
    cont.appendChild(li);

    trasPintar(() => { barra.style.width = `${Math.max(2, (d.deuda / maximo) * 100)}%`; });
  });
}

// ---------- actividad reciente (linea de tiempo) ----------

const FORMATO_RELATIVO = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
const UNIDADES_TIEMPO = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];

function haceCuanto(fecha){
  const segundos = (new Date(fecha).getTime() - Date.now()) / 1000;
  for (const [unidad, tamano] of UNIDADES_TIEMPO) {
    if (Math.abs(segundos) >= tamano) return FORMATO_RELATIVO.format(Math.round(segundos / tamano), unidad);
  }
  return 'hace un momento';
}

function pintarActividad(items){
  const cont = document.getElementById('actividad-reciente');
  cont.replaceChildren();
  cont.classList.toggle('sin-datos', !items.length);

  if (!items.length) {
    cont.appendChild(estadoVacio('Sin actividad registrada todavía.'));
    return;
  }

  items.forEach((a, i) => {
    const esPago = a.tipo === 'pago';
    const li = document.createElement('li');
    li.style.setProperty('--i', i);

    const icono = iconoElemento(esPago ? ICONO_MONEDA : ICONO_CARRITO);
    icono.className = `tl-icono ${esPago ? 'pago' : 'fiado'}`;
    icono.setAttribute('aria-hidden', 'true');

    const texto = document.createElement('div');
    texto.className = 'tl-texto';
    const cliente = document.createElement('b');
    cliente.textContent = a.cliente;
    const detalle = document.createElement('span');
    detalle.textContent = `${esPago ? 'Abono' : 'Nuevo fiado'} · ${a.detalle} · ${haceCuanto(a.fecha)}`;
    texto.append(cliente, detalle);

    const monto = document.createElement('span');
    monto.className = 'tl-monto';
    monto.textContent = `${esPago ? '+ ' : ''}${lempiras(a.monto)}`;

    li.append(icono, texto, monto);
    cont.appendChild(li);
  });
}

// ---------- recomendaciones generadas con los datos de la cartera ----------

const NIVELES_RECO = {
  critico: { etiqueta: 'Urgente', icono: ICONO_ALERTA, orden: 0 },
  atencion: { etiqueta: 'Atención', icono: ICONO_TENDENCIA, orden: 1 },
  info: { etiqueta: 'Sugerencia', icono: ICONO_BOMBILLA, orden: 2 },
  bien: { etiqueta: 'Bien', icono: ICONO_CHECK_CIRCULO, orden: 3 }
};
const MES_NOMBRE = new Intl.DateTimeFormat('es-HN', { month: 'long' });
const MAX_RECOMENDACIONES = 4;

function desplazarA(el){
  el.scrollIntoView({ behavior: MOVIMIENTO_REDUCIDO ? 'auto' : 'smooth', block: 'start' });
}

/** Lleva a la tabla de fiados y la resalta un momento para que se note a donde se fue. */
function irAFiados(){
  const tarjeta = document.getElementById('tabla-fiados').closest('.card');
  desplazarA(tarjeta);
  tarjeta.classList.remove('resaltada');
  tarjeta.getBoundingClientRect();
  tarjeta.classList.add('resaltada');
  // animationend burbujea: las filas de la tabla tambien animan, asi que se
  // filtra por el evento de la propia tarjeta.
  const alTerminar = e => {
    if (e.target !== tarjeta) return;
    tarjeta.classList.remove('resaltada');
    tarjeta.removeEventListener('animationend', alTerminar);
  };
  tarjeta.addEventListener('animationend', alTerminar);
}

function irATickets(){
  document.querySelector('.tabs button[data-tab="tickets"]')?.click();
  desplazarA(document.getElementById('tabs-admin'));
}

// Cada regla mira un aspecto de la cartera y devuelve una recomendacion o
// null. Son reglas simples y explicables a proposito: el dueño tiene que
// poder entender por que la app le sugiere algo.

/** Fiados con mas de DIAS_MORA_CRITICA dias vencidos. */
function recoMoraCritica(s, cartera){
  const critica = s.mora_critica_count || 0;
  if (critica === 0) return null;
  const uno = critica === 1;
  return {
    nivel: 'critico',
    titulo: uno ? 'Cobrá el fiado en mora crítica' : `Cobrá los ${critica} fiados en mora crítica`,
    detalle: `${uno ? 'Lleva' : 'Llevan'} más de ${DIAS_MORA_CRITICA} días vencidos ` +
      `(${porcentaje(critica, cartera.fiados_abiertos)}% de los fiados abiertos). ` +
      'Un cobro que se deja correr es cada vez más difícil de recuperar.',
    accion: { texto: 'Ver fiados', fn: irAFiados }
  };
}

/** Un solo cliente acumula una parte grande del saldo pendiente. */
function recoConcentracion(s, cartera){
  const deudores = s.top_deudores || [];
  if (deudores.length < 2 || cartera.saldo_pendiente <= 0) return null;
  const mayor = deudores[0];
  const concentracion = porcentaje(mayor.deuda, cartera.saldo_pendiente);
  if (concentracion < 20) return null;
  return {
    nivel: 'atencion',
    icono: ICONO_CLIENTES,
    titulo: `${mayor.nombre} concentra el ${concentracion}% del saldo pendiente`,
    detalle: `Debe ${lempiras(mayor.deuda)}. Pactar un plan de abonos con fechas fijas reduce el riesgo si ese cliente se atrasa.`
  };
}

/** Balance del mes en curso entre lo fiado y lo cobrado. */
function recoBalanceMes(s){
  const mes = (s.movimiento_mensual || []).at(-1);
  if (!mes) return null;
  const neto = mes.abonado - mes.fiado;
  if (neto === 0) return null;

  const nombreMes = MES_NOMBRE.format(fechaDeMes(mes.mes));
  if (neto < 0) {
    return {
      nivel: 'atencion',
      icono: ICONO_TENDENCIA,
      titulo: `En ${nombreMes} se está fiando más de lo que se cobra`,
      detalle: `Van ${lempiras(mes.fiado)} fiados y ${lempiras(mes.abonado)} abonados: ` +
        `la cartera creció ${lempiras(-neto)} en lo que va del mes.`
    };
  }
  return {
    nivel: 'bien',
    icono: ICONO_TENDENCIA,
    titulo: `En ${nombreMes} se cobra más de lo que se fía`,
    detalle: `Van ${lempiras(mes.abonado)} abonados contra ${lempiras(mes.fiado)} fiados: ` +
      `la cartera bajó ${lempiras(neto)} en lo que va del mes.`
  };
}

function recoMoraPromedio(s){
  if ((s.mora_promedio_dias || 0) <= 30) return null;
  return {
    nivel: 'atencion',
    icono: ICONO_RELOJ,
    titulo: 'La mora promedio supera un mes',
    detalle: `Los fiados vencidos llevan en promedio ${entero(s.mora_promedio_dias)} días. ` +
      'Acortar los plazos o pedir un anticipo en compras grandes ayuda a bajarla.'
  };
}

function recoTickets(s){
  const abiertos = s.tickets_abiertos || 0;
  if (abiertos === 0) return null;
  return {
    nivel: 'info',
    icono: ICONO_TICKET,
    titulo: abiertos === 1 ? 'Hay 1 ticket de error sin resolver' : `Hay ${abiertos} tickets de error sin resolver`,
    detalle: 'Revisarlos pronto evita que un fallo de la aplicación interrumpa las ventas al crédito.',
    accion: { texto: 'Ver tickets', fn: irATickets }
  };
}

/** Si no hay alertas, confirma que todo va bien; si no hay fiados, orienta para empezar. */
function recoCierre(s, cartera, recos){
  const totalFiados = (s.fiados_por_estado || []).reduce((a, f) => a + f.n, 0);
  if (totalFiados === 0) {
    return {
      nivel: 'info',
      titulo: 'Todavía no hay fiados registrados',
      detalle: 'Cuando registres fiados, acá vas a ver qué conviene atender primero.'
    };
  }
  if (recos.some(r => r.nivel === 'critico' || r.nivel === 'atencion')) return null;

  const abiertos = cartera.fiados_abiertos;
  if (!abiertos) {
    return { nivel: 'bien', titulo: 'No hay fiados pendientes de cobro', detalle: 'Todos los fiados registrados están pagados.' };
  }
  const cuales = abiertos === 1 ? 'el fiado abierto' : `los ${entero(abiertos)} fiados abiertos`;
  return {
    nivel: 'bien',
    titulo: 'La cartera está bajo control',
    detalle: `No hay mora crítica entre ${cuales}. ` +
      'Recordar el vencimiento a los clientes unos días antes es la mejor forma de seguir así.'
  };
}

const REGLAS_RECOMENDACION = [recoMoraCritica, recoConcentracion, recoBalanceMes, recoMoraPromedio, recoTickets];

/** Traduce las cifras del dashboard en acciones concretas, de la mas urgente a la menos. */
function generarRecomendaciones(s){
  const cartera = s.cartera || { saldo_pendiente: 0, fiados_abiertos: 0 };
  const recos = REGLAS_RECOMENDACION.map(regla => regla(s, cartera)).filter(Boolean);
  const cierre = recoCierre(s, cartera, recos);
  if (cierre) recos.push(cierre);

  recos.sort((a, b) => NIVELES_RECO[a.nivel].orden - NIVELES_RECO[b.nivel].orden);
  return recos.slice(0, MAX_RECOMENDACIONES);
}

function pintarRecomendaciones(s){
  const lista = document.getElementById('recomendaciones');
  lista.replaceChildren();

  generarRecomendaciones(s).forEach((r, i) => {
    const nivel = NIVELES_RECO[r.nivel];
    const li = document.createElement('li');
    li.className = `reco ${r.nivel}`;
    li.style.setProperty('--i', i);

    const icono = iconoElemento(r.icono || nivel.icono);
    icono.className = 'reco-icono';
    icono.setAttribute('aria-hidden', 'true');

    const texto = document.createElement('div');
    const etiqueta = document.createElement('span');
    etiqueta.className = 'reco-nivel';
    etiqueta.textContent = nivel.etiqueta;
    const titulo = document.createElement('b');
    titulo.textContent = r.titulo;
    const detalle = document.createElement('p');
    detalle.textContent = r.detalle;
    texto.append(etiqueta, titulo, detalle);

    li.append(icono, texto);

    if (r.accion) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'secondary small';
      boton.textContent = r.accion.texto;
      boton.addEventListener('click', r.accion.fn);
      li.appendChild(boton);
    }

    lista.appendChild(li);
  });
}

// ---------- consejos del rubro (carrusel) ----------

// Las claves tienen que coincidir con las de public/contenido/consejos.json
// (el test de api.test.js valida el archivo contra esta misma lista).
const CATEGORIAS_CONSEJO = {
  materiales: { etiqueta: 'Materiales', icono: ICONO_CAJA },
  temporada: { etiqueta: 'Temporada', icono: ICONO_LLUVIA },
  calculos: { etiqueta: 'Cálculos', icono: ICONO_REGLA },
  seguridad: { etiqueta: 'Seguridad', icono: ICONO_ESCUDO },
  negocio: { etiqueta: 'Negocio', icono: ICONO_MALETIN }
};

const carrusel = { consejos: [], actual: 0, cargado: false };

async function cargarConsejos(){
  if (carrusel.cargado) return;
  carrusel.cargado = true;

  const tarjeta = document.getElementById('tarjeta-consejos');
  const cont = document.getElementById('consejo');
  // Sin autoavance para quien pidio menos movimiento: navega con los botones.
  tarjeta.classList.toggle('sin-auto', MOVIMIENTO_REDUCIDO);

  try {
    const res = await fetch('/contenido/consejos.json', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('No se pudieron cargar los consejos');
    const { consejos } = await res.json();
    carrusel.consejos = consejos.filter(c => CATEGORIAS_CONSEJO[c.categoria]);
  } catch {
    carrusel.cargado = false; // se reintenta la proxima vez que se abra el dashboard
    cont.replaceChildren(estadoVacio('No se pudieron cargar los consejos.', null, 'div'));
    return;
  }

  if (!carrusel.consejos.length) {
    cont.replaceChildren(estadoVacio('Todavía no hay consejos publicados.', null, 'div'));
    return;
  }

  // Si hay un consejo de temporada para este mes, el carrusel arranca ahi.
  const mes = new Date().getMonth() + 1;
  pintarConsejos(mes);
  const deTemporada = carrusel.consejos.findIndex(c => c.meses?.includes(mes));
  irAConsejo(Math.max(0, deTemporada), { manual: false });
}

function pintarConsejos(mes){
  const cont = document.getElementById('consejo');
  const puntos = document.getElementById('consejo-puntos');
  cont.replaceChildren();
  puntos.replaceChildren();
  const total = carrusel.consejos.length;

  carrusel.consejos.forEach((c, i) => {
    const categoria = CATEGORIAS_CONSEJO[c.categoria];

    const slide = document.createElement('article');
    slide.className = 'consejo-slide';
    slide.setAttribute('aria-roledescription', 'consejo');
    slide.setAttribute('aria-label', `${i + 1} de ${total}`);

    const icono = iconoElemento(categoria.icono);
    icono.className = 'consejo-icono';
    icono.setAttribute('aria-hidden', 'true');

    const cuerpo = document.createElement('div');
    const chips = document.createElement('div');
    chips.className = 'consejo-chips';
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = categoria.etiqueta;
    chips.appendChild(chip);
    if (c.meses?.includes(mes)) {
      const temporada = document.createElement('span');
      temporada.className = 'chip temporada';
      temporada.textContent = 'Para este mes';
      chips.appendChild(temporada);
    }

    const titulo = document.createElement('h4');
    titulo.textContent = c.titulo;
    const texto = document.createElement('p');
    texto.textContent = c.texto;
    cuerpo.append(chips, titulo, texto);

    if (c.dato) {
      const dato = document.createElement('div');
      dato.className = 'consejo-dato';
      const valor = document.createElement('b');
      valor.textContent = c.dato.valor;
      const etiqueta = document.createElement('span');
      etiqueta.textContent = c.dato.etiqueta;
      dato.append(valor, etiqueta);
      cuerpo.appendChild(dato);
    }

    slide.append(icono, cuerpo);
    cont.appendChild(slide);

    const punto = document.createElement('button');
    punto.type = 'button';
    punto.setAttribute('aria-label', `Ver consejo ${i + 1}: ${c.titulo}`);
    punto.addEventListener('click', () => irAConsejo(i, { manual: true }));
    puntos.appendChild(punto);
  });
}

function irAConsejo(indice, { manual }){
  const total = carrusel.consejos.length;
  if (!total) return;
  carrusel.actual = (indice + total) % total;

  document.querySelectorAll('#consejo .consejo-slide').forEach((slide, i) => {
    slide.classList.toggle('activo', i === carrusel.actual);
    // Los anteriores esperan a la izquierda y los siguientes a la derecha:
    // asi cada consejo entra desde el lado hacia el que se navega.
    slide.classList.toggle('antes', i < carrusel.actual);
  });
  document.querySelectorAll('#consejo-puntos button').forEach((punto, i) => {
    punto.classList.toggle('activo', i === carrusel.actual);
    punto.setAttribute('aria-current', String(i === carrusel.actual));
  });
  document.getElementById('consejo-contador').textContent = `${carrusel.actual + 1} / ${total}`;

  // Solo se anuncia al lector de pantalla cuando la persona navega: un
  // anuncio cada 9 segundos por el autoavance seria puro ruido.
  document.getElementById('consejo').setAttribute('aria-live', manual ? 'polite' : 'off');
  reiniciarProgreso();
}

/**
 * La barra de progreso ES el temporizador: al terminar su animacion avanza
 * el consejo. Asi pausarla (hover, foco o boton) detiene el carrusel sin
 * llevar un setInterval sincronizado a mano.
 */
function reiniciarProgreso(){
  if (MOVIMIENTO_REDUCIDO) return;
  const barra = document.getElementById('consejo-progreso');
  barra.classList.remove('corriendo');
  barra.getBoundingClientRect();
  barra.classList.add('corriendo');
}

document.getElementById('consejo-progreso').addEventListener('animationend', () =>
  irAConsejo(carrusel.actual + 1, { manual: false }));
document.getElementById('consejo-anterior').addEventListener('click', () =>
  irAConsejo(carrusel.actual - 1, { manual: true }));
document.getElementById('consejo-siguiente').addEventListener('click', () =>
  irAConsejo(carrusel.actual + 1, { manual: true }));

document.getElementById('consejo-pausa').addEventListener('click', e => {
  const boton = e.currentTarget;
  const pausado = document.getElementById('tarjeta-consejos').classList.toggle('pausado');
  boton.setAttribute('aria-pressed', String(pausado));
  boton.setAttribute('aria-label', pausado ? 'Reanudar consejos' : 'Pausar consejos');
  boton.replaceChildren(iconoElemento(pausado ? ICONO_PLAY : ICONO_PAUSA));
});

document.getElementById('tarjeta-consejos').addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') irAConsejo(carrusel.actual - 1, { manual: true });
  if (e.key === 'ArrowRight') irAConsejo(carrusel.actual + 1, { manual: true });
});

// Deslizar con el dedo en el telefono.
let inicioDeslizar = null;
const zonaConsejo = document.getElementById('consejo');
zonaConsejo.addEventListener('pointerdown', e => { inicioDeslizar = e.clientX; });
zonaConsejo.addEventListener('pointerup', e => {
  if (inicioDeslizar == null) return;
  const distancia = e.clientX - inicioDeslizar;
  inicioDeslizar = null;
  if (Math.abs(distancia) > 40) irAConsejo(carrusel.actual + (distancia < 0 ? 1 : -1), { manual: true });
});

function avisarMoraCriticaSiCorresponde(cantidad){
  if (cantidad <= 0 || !('Notification' in window)) return;

  const mostrar = () => new Notification('Fiados Ferrefacil', {
    body: `Tenés ${cantidad} fiado(s) con más de ${DIAS_MORA_CRITICA} días de mora.`,
    icon: '/icons/icon-192.png'
  });

  if (Notification.permission === 'granted') {
    mostrar();
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => { if (p === 'granted') mostrar(); });
  }
}

let dashboardCargado = false;

async function cargarDashboard(){
  const tab = document.getElementById('tab-dashboard');
  // Al recargar se conserva lo ya dibujado, atenuado, en vez de parpadear con
  // un esqueleto: las cifras no saltan de lugar mientras llega la respuesta.
  if (dashboardCargado) tab.classList.add('recargando');
  else pintarEsqueletoKpis();

  try {
    const s = await api('/admin/stats');
    pintarHero(s);
    pintarKpis(s);
    pintarRecomendaciones(s);
    cargarConsejos();
    pintarMovimiento(s.movimiento_mensual || []);
    pintarChartFiados(s.fiados_por_estado);
    pintarTopDeudores(s.top_deudores, s.cartera?.saldo_pendiente);
    pintarActividad(s.actividad_reciente);
    dashboardCargado = true;
    avisarMoraCriticaSiCorresponde(s.mora_critica_count);
  } catch (e) {
    /* si no es admin, la ruta ya no se ve */
  } finally {
    tab.classList.remove('recargando');
  }
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
    </tr>`).join('') || `<tr><td colspan="5"><div class="vacio"><img src="${IMG_TODO_AL_DIA}" alt="" width="120" height="90">Sin tickets registrados. ¡Buena señal!</div></td></tr>`;
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

  mostrarErrorLogin(error);
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
