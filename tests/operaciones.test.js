require('dotenv').config({ quiet: true });

// Esquema propio, aislado de los otros archivos de test.
process.env.DB_SCHEMA = 'test_operaciones';

const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../src/db');
const app = require('../src/app');
const migrate = require('../src/migrate');
const cache = require('../src/cache');

const SCHEMA = process.env.DB_SCHEMA;
let agent;

beforeAll(async () => {
  await db.query(`drop schema if exists ${SCHEMA} cascade`);
  await db.query(`create schema ${SCHEMA}`);
  await migrate.aplicar({ soloEsquema: true });
  await db.query(
    'insert into usuarios (email, password_hash, rol) values ($1, $2, $3)',
    ['demo@ferrefacil.com', bcrypt.hashSync('Demo2026!', 10), 'demo']
  );

  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'demo@ferrefacil.com', password: 'Demo2026!' });
}, 60000);

afterAll(async () => {
  await db.query(`drop schema if exists ${SCHEMA} cascade`);
  await db.pool.end();
}, 60000);

const clave = () => 'test-' + Math.random().toString(16).slice(2);

// ---------------------------------------------------------------------------

describe('idempotencia de las escrituras', () => {
  test('tres envios con la misma clave crean UN cliente', async () => {
    const k = clave();
    const cuerpo = { nombre: 'Cliente Triple Clic' };

    const r1 = await agent.post('/api/clientes').set('Idempotency-Key', k).send(cuerpo);
    const r2 = await agent.post('/api/clientes').set('Idempotency-Key', k).send(cuerpo);
    const r3 = await agent.post('/api/clientes').set('Idempotency-Key', k).send(cuerpo);

    expect(r1.status).toBe(201);
    // Los reintentos devuelven la respuesta original, no crean otra fila.
    expect(r2.body.id).toBe(r1.body.id);
    expect(r3.body.id).toBe(r1.body.id);
    expect(r2.headers['idempotent-replay']).toBe('true');

    const { n } = await db.one(
      'select count(*)::int as n from clientes where nombre = $1', ['Cliente Triple Clic']);
    expect(n).toBe(1);
  });

  test('tres abonos con la misma clave descuentan UNA vez', async () => {
    const cliente = await agent.post('/api/clientes').send({ nombre: 'Abono Repetido' });
    const fiado = await agent.post('/api/fiados').send({
      cliente_id: cliente.body.id, descripcion: 'Fiado para abonar',
      monto: 1000, fecha_vencimiento: '2030-01-01'
    });
    const url = `/api/fiados/${fiado.body.id}/pagos`;

    const k = clave();
    await agent.post(url).set('Idempotency-Key', k).send({ monto: 300 });
    await agent.post(url).set('Idempotency-Key', k).send({ monto: 300 });
    const r3 = await agent.post(url).set('Idempotency-Key', k).send({ monto: 300 });

    // Si se hubiera repetido, el saldo seria 100 en vez de 700: exactamente
    // el descuadre que sufre el cliente cuando la red va lenta.
    expect(r3.body.saldo).toBe(700);
    const { n } = await db.one(
      'select count(*)::int as n from pagos where fiado_id = $1', [fiado.body.id]);
    expect(n).toBe(1);
  });

  test('claves distintas si registran abonos distintos', async () => {
    const cliente = await agent.post('/api/clientes').send({ nombre: 'Dos Abonos' });
    const fiado = await agent.post('/api/fiados').send({
      cliente_id: cliente.body.id, descripcion: 'Fiado dos abonos',
      monto: 1000, fecha_vencimiento: '2030-01-01'
    });
    const url = `/api/fiados/${fiado.body.id}/pagos`;

    await agent.post(url).set('Idempotency-Key', clave()).send({ monto: 200 });
    const r = await agent.post(url).set('Idempotency-Key', clave()).send({ monto: 300 });
    expect(r.body.saldo).toBe(500);
  });

  test('reusar una clave con datos distintos se rechaza', async () => {
    const k = clave();
    await agent.post('/api/clientes').set('Idempotency-Key', k).send({ nombre: 'Primero' });
    const r = await agent.post('/api/clientes').set('Idempotency-Key', k).send({ nombre: 'Distinto' });

    // Aceptarlo enmascararia un bug del cliente bajo una clave ya usada.
    expect(r.status).toBe(409);
    const { n } = await db.one(
      'select count(*)::int as n from clientes where nombre = $1', ['Distinto']);
    expect(n).toBe(0);
  });

  test('sin la cabecera la API sigue funcionando', async () => {
    const r = await agent.post('/api/clientes').send({ nombre: 'Sin Clave' });
    expect(r.status).toBe(201);
  });

  test('una operacion invalida libera la clave para reintentar', async () => {
    const k = clave();
    const malo = await agent.post('/api/clientes').set('Idempotency-Key', k).send({ nombre: '' });
    expect(malo.status).toBe(400);

    // Corregir los datos y reintentar con la misma clave debe funcionar.
    const bueno = await agent.post('/api/clientes').set('Idempotency-Key', k).send({ nombre: 'Ya Corregido' });
    expect(bueno.status).toBe(201);
  });

  test('los fiados tambien son idempotentes', async () => {
    const cliente = await agent.post('/api/clientes').send({ nombre: 'Fiado Duplicado' });
    const k = clave();
    const cuerpo = {
      cliente_id: cliente.body.id, descripcion: 'Cemento repetido',
      monto: 500, fecha_vencimiento: '2030-01-01'
    };

    const a = await agent.post('/api/fiados').set('Idempotency-Key', k).send(cuerpo);
    const b = await agent.post('/api/fiados').set('Idempotency-Key', k).send(cuerpo);

    expect(b.body.id).toBe(a.body.id);
    const { n } = await db.one(
      'select count(*)::int as n from fiados where descripcion = $1', ['Cemento repetido']);
    expect(n).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe('cacheo', () => {
  test('la vitrina publica se marca cacheable y compartible', async () => {
    const r = await request(app).get('/api/publico/vitrina');
    expect(r.headers['cache-control']).toContain('public');
    expect(r.headers['cache-control']).toContain('s-maxage');
    expect(r.headers['cache-control']).toContain('stale-while-revalidate');
    expect(r.headers.etag).toBeTruthy();
  });

  test('los datos con sesion no se guardan en intermediarios', async () => {
    const r = await agent.get('/api/clientes');
    // "private" impide que un proxy compartido guarde la cartera de un usuario.
    expect(r.headers['cache-control']).toContain('private');
    expect(r.headers['cache-control']).toContain('no-cache');
  });

  test('las escrituras nunca se cachean', async () => {
    const r = await agent.post('/api/clientes').send({ nombre: 'No Cachear' });
    expect(r.headers['cache-control']).toBe('no-store');
  });

  test('un ETag igual responde 304 sin cuerpo', async () => {
    const r1 = await request(app).get('/api/publico/vitrina');
    const r2 = await request(app).get('/api/publico/vitrina').set('If-None-Match', r1.headers.etag);
    expect(r2.status).toBe(304);
    expect(r2.text).toBeFalsy();
  });

  test('memo sirve el valor guardado sin volver a ejecutar', async () => {
    cache.invalidar('prueba');
    let llamadas = 0;
    const fn = async () => { llamadas++; return { v: llamadas }; };

    const a = await cache.memo('prueba', fn, 5000);
    const b = await cache.memo('prueba', fn, 5000);
    expect(llamadas).toBe(1);
    expect(b).toEqual(a);

    cache.invalidar('prueba');
    await cache.memo('prueba', fn, 5000);
    expect(llamadas).toBe(2);
  });

  test('las llamadas concurrentes comparten una sola ejecucion', async () => {
    cache.invalidar('concurrente');
    let llamadas = 0;
    const fn = () => { llamadas++; return new Promise(r => setTimeout(() => r('x'), 30)); };

    await Promise.all([1, 2, 3, 4, 5].map(() => cache.memo('concurrente', fn, 5000)));
    // Cinco visitas simultaneas a la landing deben producir una consulta.
    expect(llamadas).toBe(1);
  });

  test('memo no deja cacheado un fallo', async () => {
    cache.invalidar('falla');
    let intentos = 0;
    const fn = async () => { intentos++; throw new Error('boom'); };

    await expect(cache.memo('falla', fn, 5000)).rejects.toThrow('boom');
    await expect(cache.memo('falla', fn, 5000)).rejects.toThrow('boom');
    // Si el error quedara guardado, el segundo intento no llamaria a fn.
    expect(intentos).toBe(2);
  });

  test('el TTL expira', async () => {
    cache.invalidar('ttl');
    let llamadas = 0;
    const fn = async () => { llamadas++; return llamadas; };

    await cache.memo('ttl', fn, 20);
    await new Promise(r => setTimeout(r, 40));
    await cache.memo('ttl', fn, 20);
    expect(llamadas).toBe(2);
  });

  test('escribir invalida la vitrina', async () => {
    await request(app).get('/api/publico/vitrina');
    expect(cache.estado().claves).toContain('vitrina');

    await agent.post('/api/clientes').send({ nombre: 'Invalida Vitrina' });
    // Sin esto, la landing mostraria datos viejos hasta que expire el TTL.
    expect(cache.estado().claves).not.toContain('vitrina');
  });

  test('los estaticos criticos se revalidan siempre', async () => {
    for (const ruta of ['/sw.js', '/manifest.json']) {
      const r = await request(app).get(ruta);
      expect(r.headers['cache-control']).toContain('must-revalidate');
    }
  });
});
