// Animaciones y datos de la landing.
//
// Va en un archivo aparte y no inline porque la CSP de src/app.js declara
// script-src 'self' sin unsafe-inline: un <script> dentro del HTML seria
// bloqueado por el navegador.
//
// Principio: el HTML se sirve visible. Solo cuando este script confirma que
// puede animar marca <html data-anim="on">, y es ese atributo el que activa
// en el CSS el estado inicial oculto. Asi, si el JS no carga o el usuario
// pidio reducir movimiento, la pagina se ve completa y estatica en vez de
// quedarse en blanco.
(function () {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const puedeAnimar = !reduce && 'IntersectionObserver' in window;

  // Se marca cuanto antes (el script se carga en el <head>, sin defer) para
  // que el estado inicial se aplique antes del primer pintado y no se vea
  // un parpadeo del contenido apareciendo y ocultandose.
  if (puedeAnimar) document.documentElement.dataset.anim = 'on';

  const FORMATO_LEMPIRAS = new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const FORMATO_ENTERO = new Intl.NumberFormat('es-HN', { maximumFractionDigits: 0 });
  const lempiras = n => 'L. ' + FORMATO_LEMPIRAS.format(Number(n) || 0);
  const entero = n => FORMATO_ENTERO.format(Math.round(Number(n) || 0));

  /** Cuenta desde 0 hasta el valor de data-contar, con desaceleracion. */
  function contar(el) {
    const destino = Number(el.dataset.contar);
    if (!puedeAnimar || !Number.isFinite(destino)) return; // se queda el texto del HTML
    const formato = el.dataset.formato === 'lempiras' ? lempiras : entero;
    const sufijo = el.dataset.sufijo || '';
    const inicio = performance.now();
    const duracion = 1500;

    const paso = ahora => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      el.textContent = formato(destino * (1 - Math.pow(1 - t, 3))) + sufijo;
      if (t < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }

  /** Revela cada .reveal al entrar en pantalla (una sola vez) y arranca sus contadores. */
  function revelar() {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        const delay = Number(el.dataset.delay) || 0;
        setTimeout(() => {
          el.classList.add('visible');
          for (const numero of el.querySelectorAll('[data-contar]')) contar(numero);
        }, delay);
        observer.unobserve(el); // se anima una sola vez, no en cada scroll
      }
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -10% 0px' // dispara un poco antes del borde inferior
    });

    for (const el of document.querySelectorAll('.reveal')) observer.observe(el);
  }

  /** La barra superior es transparente sobre el hero y se vuelve solida al bajar. */
  function vigilarNav() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    const actualizar = () => nav.classList.toggle('solida', window.scrollY > 12);
    actualizar();
    window.addEventListener('scroll', actualizar, { passive: true });
  }

  /**
   * La ventana del hero se inclina levemente siguiendo el puntero. Solo con
   * mouse: en pantallas tactiles no hay "puntero encima" y el efecto solo
   * moveria la tarjeta al hacer scroll.
   */
  function inclinarEscena() {
    const hero = document.querySelector('.hero');
    const tilt = document.querySelector('.tilt');
    if (!hero || !tilt || !window.matchMedia('(pointer: fine)').matches) return;

    hero.addEventListener('pointermove', e => {
      const caja = hero.getBoundingClientRect();
      const x = (e.clientX - caja.left) / caja.width - 0.5;
      const y = (e.clientY - caja.top) / caja.height - 0.5;
      tilt.style.setProperty('--ry', `${(-7 + x * 10).toFixed(2)}deg`);
      tilt.style.setProperty('--rx', `${(3 - y * 8).toFixed(2)}deg`);
    });
    hero.addEventListener('pointerleave', () => {
      tilt.style.removeProperty('--ry');
      tilt.style.removeProperty('--rx');
    });
  }

  /**
   * El ejemplo de mora usa fechas reales (hoy y hace 17 dias) para no quedar
   * desactualizado; el HTML trae unas fechas fijas de respaldo.
   */
  function fechasDeEjemplo() {
    const hoy = new Date();
    const vence = new Date(hoy);
    vence.setDate(hoy.getDate() - 17);
    const corto = new Intl.DateTimeFormat('es-HN', { day: 'numeric', month: 'short' });
    const poner = (clave, fecha) => {
      const el = document.querySelector(`[data-fecha="${clave}"]`);
      if (el) el.textContent = corto.format(fecha).replace('.', '');
    };
    poner('vence', vence);
    poner('hoy', hoy);
  }

  document.addEventListener('DOMContentLoaded', () => {
    vigilarNav();
    fechasDeEjemplo();
    if (!puedeAnimar) return;

    revelar();
    inclinarEscena();
    const valorHero = document.querySelector('.mini-valor');
    if (valorHero) setTimeout(() => contar(valorHero), 900);
  });
})();

// ---------------------------------------------------------------------------
// Datos reales.
//
// La tarjeta del hero y las credenciales de la demo salen de la API. El
// marcado estatico se conserva como respaldo: si un fetch falla, la pagina se
// queda con lo que ya estaba en vez de mostrar huecos.
// ---------------------------------------------------------------------------
(function () {
  const texto = v => String(v ?? '');
  const FORMATO = new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = n => 'L. ' + FORMATO.format(Number(n) || 0);

  // Se construye con createElement y textContent, nunca con innerHTML: los
  // nombres y descripciones vienen de la base y podrian contener HTML.
  function fila(f) {
    const row = document.createElement('div');
    row.className = 'mock-row';

    const top = document.createElement('div');
    top.className = 'mock-top';

    const nombre = document.createElement('span');
    nombre.className = 'mock-name';
    nombre.textContent = texto(f.cliente);

    const monto = document.createElement('span');
    monto.className = 'mock-amount';
    monto.textContent = money(f.saldo);

    top.append(nombre, monto);

    const desc = document.createElement('p');
    desc.className = 'mock-desc';
    desc.textContent = texto(f.descripcion);

    const estado = texto(f.estado);
    const badge = document.createElement('span');
    badge.className = 'badge ' + estado;
    badge.textContent = estado.charAt(0).toUpperCase() + estado.slice(1);

    row.append(top, desc, badge);

    if (f.dias_mora > 0) {
      const mora = document.createElement('span');
      mora.className = 'mora';
      mora.textContent = f.dias_mora + (f.dias_mora === 1 ? ' día de mora' : ' días de mora');
      row.appendChild(mora);
    }
    return row;
  }

  function pintarVitrina(datos) {
    if (!datos?.length) return;
    const caja = document.getElementById('vitrina');
    if (!caja) return;

    const barra = caja.querySelector('.mock-bar');
    caja.replaceChildren(...(barra ? [barra] : []), ...datos.map(fila));
  }

  function pintarDemo(cred) {
    if (!cred?.email) return;
    const email = document.getElementById('demo-email');
    const password = document.getElementById('demo-password');
    if (email) email.textContent = cred.email;
    if (password) password.textContent = cred.password;
  }

  function cargar(url, pintar) {
    fetch(url, { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(pintar)
      .catch(() => { /* se conserva el respaldo estatico */ });
  }

  document.addEventListener('DOMContentLoaded', () => {
    cargar('/api/publico/vitrina', pintarVitrina);
    cargar('/api/publico/demo', pintarDemo);
  });
})();
