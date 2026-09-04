const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const path = require('path');

const authRoutes = require('./routes/auth');
const clientesRoutes = require('./routes/clientes');
const fiadosRoutes = require('./routes/fiados');
const healthRoutes = require('./routes/health');
const { router: publicoRoutes } = require('./routes/publico');

const app = express();

// Vercel termina el TLS en su edge y habla HTTP con la funcion. Sin esto
// req.protocol seria 'http' y el redirect_to que se manda a Google saldria
// con esquema incorrecto, y Google lo rechazaria por no coincidir.
app.set('trust proxy', 1);

// ===================== SEGURIDAD =====================
// Content-Security-Policy propia (entregable 8): protege contra XSS al
// restringir de donde puede cargar scripts/estilos la pagina.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"]
      }
    }
  })
);

app.use(express.json());
app.use(cookieParser());

// Codigo de verificacion del reto, visible en el healthcheck y en el HTML.
const VERIFICATION_CODE = process.env.VERIFICATION_CODE || 'PENDIENTE-DE-CONFIGURAR';
app.get('/verificacion.txt', (req, res) => res.type('text/plain').send(VERIFICATION_CODE));

app.use('/api/auth', authRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/fiados', fiadosRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/publico', publicoRoutes);

// La raiz sirve la landing (public/index.html). La aplicacion en si vive en
// /app; se declara explicitamente para que la URL limpia funcione igual en
// local (express.static no resuelve extensiones) y en Vercel.
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'app.html'));
});

// Estaticos con cache negociada.
//
// maxAge corto y no inmutable a proposito: los archivos no llevan hash en
// el nombre, asi que un cache largo dejaria a los usuarios con una version
// vieja tras cada despliegue. Con etag activo, la peticion de revalidacion
// se responde con un 304 sin cuerpo cuando nada cambio, que es casi todo
// el ahorro sin el riesgo.
//
// El service worker (public/sw.js) es quien da el cache agresivo y el uso
// sin conexion, y se invalida subiendo su CACHE_NAME en cada cambio.
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: '5m',
  etag: true,
  lastModified: true,
  setHeaders: (res, ruta) => {
    // Estos tres definen el comportamiento de la app instalada: servirlos
    // cacheados retrasaria dias la llegada de una version nueva.
    if (/(?:sw\.js|manifest\.json|index\.html|app\.html)$/.test(ruta)) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
  }
}));

// 404 manejado explicitamente (entregable 3).
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
});

// Manejador de errores. Con la base en red, cualquier consulta puede fallar
// (caida de red, pooler saturado); sin esto, un rechazo de promesa dejaria la
// peticion colgada hasta el timeout en vez de responder.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err.message);
  // Nunca se filtra el detalle interno al cliente: podria incluir fragmentos
  // de la consulta o de la cadena de conexion.
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
