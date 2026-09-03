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
