// Animaciones de la landing.
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
  var reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduce || !('IntersectionObserver' in window)) return;

  // Se marca cuanto antes (el script se carga en el <head>, sin defer) para
  // que el estado inicial se aplique antes del primer pintado y no se vea
  // un parpadeo del contenido apareciendo y ocultandose.
  document.documentElement.setAttribute('data-anim', 'on');

  document.addEventListener('DOMContentLoaded', function () {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = Number(el.getAttribute('data-delay')) || 0;
        setTimeout(function () { el.classList.add('visible'); }, delay);
        observer.unobserve(el); // se anima una sola vez, no en cada scroll
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -10% 0px' // dispara un poco antes del borde inferior
    });

    var animables = document.querySelectorAll('.reveal');
    for (var i = 0; i < animables.length; i++) observer.observe(animables[i]);
  });
})();

// ---------------------------------------------------------------------------
// Datos reales.
//
// La tarjeta del hero y las credenciales de la demo eran HTML fijo. Ahora
// salen de la API. El marcado estatico se conserva como respaldo: si un fetch
// falla, la pagina se queda con lo que ya estaba en vez de mostrar huecos.
// ---------------------------------------------------------------------------
(function () {
  function texto(v) {
    return String(v == null ? '' : v);
  }

  function money(n) {
    return 'L. ' + Number(n).toLocaleString('es-HN', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  // Se construye con createElement y textContent, nunca con innerHTML: los
  // nombres y descripciones vienen de la base y podrian contener HTML.
  function fila(f) {
    var row = document.createElement('div');
    row.className = 'mock-row';

    var top = document.createElement('div');
    top.className = 'mock-top';

    var nombre = document.createElement('span');
    nombre.className = 'mock-name';
    nombre.textContent = texto(f.cliente);

    var monto = document.createElement('span');
    monto.className = 'mock-amount';
    monto.textContent = money(f.saldo);

    top.appendChild(nombre);
    top.appendChild(monto);

    var desc = document.createElement('p');
    desc.className = 'mock-desc';
    desc.textContent = texto(f.descripcion);

    var badge = document.createElement('span');
    badge.className = 'badge ' + texto(f.estado);
    badge.textContent = texto(f.estado).charAt(0).toUpperCase() + texto(f.estado).slice(1);

    row.appendChild(top);
    row.appendChild(desc);
    row.appendChild(badge);

    if (f.dias_mora > 0) {
      var mora = document.createElement('span');
      mora.className = 'mora';
      mora.textContent = f.dias_mora + (f.dias_mora === 1 ? ' día de mora' : ' días de mora');
      row.appendChild(mora);
    }
    return row;
  }

  function pintarVitrina(datos) {
    if (!datos || !datos.length) return;
    var caja = document.getElementById('vitrina');
    if (!caja) return;

    var barra = caja.querySelector('.mock-bar');
    caja.innerHTML = '';
    if (barra) caja.appendChild(barra);
    datos.forEach(function (f) { caja.appendChild(fila(f)); });
  }

  function pintarDemo(cred) {
    if (!cred || !cred.email) return;
    var e = document.getElementById('demo-email');
    var p = document.getElementById('demo-password');
    if (e) e.textContent = cred.email;
    if (p) p.textContent = cred.password;
  }

  function cargar(url, pintar) {
    fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(pintar)
      .catch(function () { /* se conserva el respaldo estatico */ });
  }

  document.addEventListener('DOMContentLoaded', function () {
    cargar('/api/publico/vitrina', pintarVitrina);
    cargar('/api/publico/demo', pintarDemo);
  });
})();
