// Punto de entrada serverless para Vercel.
//
// Diferencia con src/server.js: alli se llama app.listen() porque Render
// corre un proceso permanente. Vercel invoca una funcion por request, asi
// que aqui solo se exporta la app y la plataforma la envuelve.
//
// El filesystem de Vercel es de solo lectura salvo /tmp, por eso la base
// se crea ahi. IMPORTANTE: /tmp es efimero y propio de cada instancia, o
// sea que los datos se reinician en cada arranque en frio. Sirve para la
// demo, no para produccion real; para eso hace falta un host con disco
// persistente (ver render.yaml) o una base de datos en red.
process.env.DB_PATH = process.env.DB_PATH || '/tmp/fiados.db';

module.exports = require('../src/app');
