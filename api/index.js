// Punto de entrada serverless para Vercel.
//
// Diferencia con src/server.js: alli se llama app.listen() porque Render
// corre un proceso permanente. Vercel invoca una funcion por request, asi
// que aqui solo se exporta la app y la plataforma la envuelve.
//
// Ya no se fija DB_PATH: los datos viven en PostgreSQL (Supabase) y la
// conexion sale de DATABASE_URL, definida en las variables de entorno del
// proyecto. Con esto desaparece la limitacion de /tmp, que reiniciaba la
// base en cada arranque en frio.
module.exports = require('../src/app');
