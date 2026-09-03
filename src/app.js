const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const path = require('path');

const authRoutes = require('./routes/auth');
const clientesRoutes = require('./routes/clientes');
const fiadosRoutes = require('./routes/fiados');
const healthRoutes = require('./routes/health');

const app = express();

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

app.use(express.static(path.join(__dirname, '..', 'public')));

// 404 manejado explicitamente (entregable 3).
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
});

module.exports = app;
