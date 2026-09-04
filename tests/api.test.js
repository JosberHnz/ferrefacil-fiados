require('dotenv').config({ quiet: true });

// Los tests corren sobre un ESQUEMA APARTE de la misma base. Se crea al
// empezar y se destruye al terminar, asi que nunca tocan los datos reales
// de public. Hay que fijarlo antes de requerir src/db, que lo lee al cargar.
process.env.DB_SCHEMA = process.env.TEST_DB_SCHEMA || 'test_fiados';

const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../src/db');
const app = require('../src/app');
const migrate = require('../src/migrate');

const SCHEMA = process.env.DB_SCHEMA;

beforeAll(async () => {
  await db.query(`drop schema if exists ${SCHEMA} cascade`);
  await db.query(`create schema ${SCHEMA}`);

  // Se aplican las MISMAS migraciones que en produccion, saltando las de
  // datos. Asi los tests validan el esquema real: si una migracion tuviera
  // un error, salta aqui y no en Supabase.
  await migrate.aplicar({ soloEsquema: true });

  await db.query(
    'insert into usuarios (email, password_hash, rol) values ($1, $2, $3)',
    ['demo@ferrefacil.com', bcrypt.hashSync('Demo2026!', 10), 'demo']
  );
}, 60000);

afterAll(async () => {
  await db.query(`drop schema if exists ${SCHEMA} cascade`);
  await db.pool.end();
}, 60000);

describe('GET /api/health', () => {
  test('responde ok en JSON sin necesitar sesion', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('rutas protegidas sin sesion', () => {
  test('GET /api/clientes devuelve 401 sin login', async () => {
    const res = await request(app).get('/api/clientes');
    expect(res.status).toBe(401);
  });
});

describe('flujo completo: login -> crear cliente -> crear fiado -> pagar', () => {
  const agent = request.agent(app);

  test('login con usuario demo', async () => {
    const res = await agent
      .post('/api/auth/login')
      .send({ email: 'demo@ferrefacil.com', password: 'Demo2026!' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('demo@ferrefacil.com');
  });

  test('login con password incorrecta devuelve 401', async () => {
    const res = await agent
      .post('/api/auth/login')
      .send({ email: 'demo@ferrefacil.com', password: 'incorrecta' });
    expect(res.status).toBe(401);
  });

  let clienteId;
  test('crear un cliente nuevo', async () => {
    const res = await agent.post('/api/clientes').send({ nombre: 'Pulperia Test' });
    expect(res.status).toBe(201);
    expect(res.body.nombre).toBe('Pulperia Test');
    clienteId = res.body.id;
  });

  let fiadoId;
  test('crear un fiado para ese cliente', async () => {
    const res = await agent.post('/api/fiados').send({
      cliente_id: clienteId,
      descripcion: 'Cemento 2 sacos',
      monto: 500,
      fecha_vencimiento: '2020-01-01' // vencido a proposito, para ver mora
    });
    expect(res.status).toBe(201);
    expect(res.body.saldo).toBe(500);
    expect(res.body.dias_mora).toBeGreaterThan(0);
    fiadoId = res.body.id;
  });

  test('registrar un pago parcial reduce el saldo', async () => {
    const res = await agent.post(`/api/fiados/${fiadoId}/pagos`).send({ monto: 200 });
    expect(res.status).toBe(200);
    expect(res.body.saldo).toBe(300);
    expect(res.body.estado).toBe('parcial');
  });

  test('pagar el resto marca el fiado como pagado', async () => {
    const res = await agent.post(`/api/fiados/${fiadoId}/pagos`).send({ monto: 300 });
    expect(res.status).toBe(200);
    expect(res.body.saldo).toBe(0);
    expect(res.body.estado).toBe('pagado');
    expect(res.body.dias_mora).toBe(0);
  });

  test('no se puede borrar un cliente sin rol admin', async () => {
    const res = await agent.delete(`/api/clientes/${clienteId}`);
    expect(res.status).toBe(403);
  });
});

describe('validaciones', () => {
  const agent = request.agent(app);
  beforeAll(async () => {
    await agent.post('/api/auth/login').send({ email: 'demo@ferrefacil.com', password: 'Demo2026!' });
  });

  test('crear cliente sin nombre falla', async () => {
    const res = await agent.post('/api/clientes').send({});
    expect(res.status).toBe(400);
  });

  test('crear fiado con monto negativo falla', async () => {
    const cliente = await agent.post('/api/clientes').send({ nombre: 'Otro' });
    const res = await agent.post('/api/fiados').send({
      cliente_id: cliente.body.id,
      descripcion: 'x',
      monto: -10,
      fecha_vencimiento: '2026-01-01'
    });
    expect(res.status).toBe(400);
  });

  test('ruta que no existe devuelve 404', async () => {
    const res = await request(app).get('/esto-no-existe-nunca');
    expect(res.status).toBe(404);
  });
});

describe('enrutado de paginas', () => {
  test('la raiz sirve la landing, no la aplicacion', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('con la mora ya calculada');
    expect(res.text).not.toContain('id="login-form"');
  });

  test('/app sirve el shell de la aplicacion con el login', async () => {
    const res = await request(app).get('/app');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="login-form"');
  });

  test('la landing enlaza al login en /app', async () => {
    const res = await request(app).get('/');
    expect(res.text).toContain('href="/app"');
  });
});

describe('animaciones de la landing', () => {
  test('el script va en archivo aparte: la CSP prohibe scripts inline', async () => {
    const res = await request(app).get('/');
    // <script> sin src seria bloqueado por script-src 'self'
    expect(res.text).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
    expect(res.text).toContain('src="/landing.js"');
  });

  test('landing.js se sirve como estatico', async () => {
    const res = await request(app).get('/landing.js');
    expect(res.status).toBe(200);
    expect(res.text).toContain('IntersectionObserver');
  });

  test('respeta prefers-reduced-motion', async () => {
    const res = await request(app).get('/');
    expect(res.text).toContain('prefers-reduced-motion');
  });
});

describe('vitrina publica de la landing', () => {
  const { abreviar } = require('../src/routes/publico');

  test('abreviar oculta el apellido completo', () => {
    expect(abreviar('Carlos Martinez')).toBe('Carlos M.');
    expect(abreviar('Constructora Pineda')).toBe('Constructora P.');
    expect(abreviar('Wendy')).toBe('Wendy');
  });

  test('no requiere sesion', async () => {
    const res = await request(app).get('/api/publico/vitrina');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('devuelve datos reales con mora calculada y sin apellidos', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'demo@ferrefacil.com', password: 'Demo2026!' });
    const cliente = await agent.post('/api/clientes').send({ nombre: 'Vitrina Apellido' });
    await agent.post('/api/fiados').send({
      cliente_id: cliente.body.id,
      descripcion: 'Cemento de prueba',
      monto: 900,
      fecha_vencimiento: '2020-01-01' // vencido, debe generar mora
    });

    const res = await request(app).get('/api/publico/vitrina');
    const fila = res.body.find(f => f.descripcion === 'Cemento de prueba');

    expect(fila).toBeDefined();
    expect(fila.cliente).toBe('Vitrina A.');
    expect(fila.saldo).toBe(900);
    expect(fila.dias_mora).toBeGreaterThan(0);
    // El apellido completo no debe viajar nunca a una pagina publica.
    expect(JSON.stringify(res.body)).not.toContain('Apellido');
  });

  test('devuelve como maximo 3 fiados', async () => {
    const res = await request(app).get('/api/publico/vitrina');
    expect(res.body.length).toBeLessThanOrEqual(3);
  });
});

describe('tipos que devuelve la API', () => {
  test('los id son numeros, no cadenas', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'demo@ferrefacil.com', password: 'Demo2026!' });

    const cliente = await agent.post('/api/clientes').send({ nombre: 'Tipos Numericos' });
    // pg entrega bigint como string; con SQLite eran numeros y el frontend
    // compara ids con ===, asi que la conversion tiene que mantenerse.
    expect(typeof cliente.body.id).toBe('number');

    const fiado = await agent.post('/api/fiados').send({
      cliente_id: cliente.body.id,
      descripcion: 'Tipos',
      monto: 100,
      fecha_vencimiento: '2030-01-01'
    });
    expect(typeof fiado.body.id).toBe('number');
    expect(typeof fiado.body.cliente_id).toBe('number');
    // numeric tambien: si llegara como "100.00" el frontend concatenaria.
    expect(typeof fiado.body.monto).toBe('number');
    expect(typeof fiado.body.saldo).toBe('number');
    // date se queda como cadena 'YYYY-MM-DD', que es lo que espera mora.js.
    expect(typeof fiado.body.fecha_vencimiento).toBe('string');
    expect(fiado.body.fecha_vencimiento).toBe('2030-01-01');
  });
});

describe('inicio de sesion con Google', () => {
  const google = require('../src/oauth-google');

  afterEach(() => {
    delete process.env.GOOGLE_EMAILS_PERMITIDOS;
    delete process.env.GOOGLE_DOMINIO_PERMITIDO;
  });

  test('por defecto ninguna cuenta nueva de Google tiene acceso', () => {
    // Sin esto, cualquier cuenta de Google del mundo veria la cartera:
    // todas las rutas protegidas se conforman con que exista sesion.
    expect(google.permitido('cualquiera@gmail.com')).toBe(false);
  });

  test('la lista de permitidos habilita correos concretos', () => {
    process.env.GOOGLE_EMAILS_PERMITIDOS = 'jefe@ferrefacil.com, otro@gmail.com';
    expect(google.permitido('jefe@ferrefacil.com')).toBe(true);
    expect(google.permitido('otro@gmail.com')).toBe(true);
    expect(google.permitido('intruso@gmail.com')).toBe(false);
  });

  test('el dominio permitido habilita a todo el dominio', () => {
    process.env.GOOGLE_DOMINIO_PERMITIDO = 'ferrefacil.com';
    expect(google.permitido('quien.sea@ferrefacil.com')).toBe(true);
    expect(google.permitido('quien.sea@otracosa.com')).toBe(false);
  });

  test('el challenge PKCE es el SHA-256 del verifier en base64url', () => {
    const crypto = require('crypto');
    const v = google.crearVerifier();
    const esperado = crypto.createHash('sha256').update(v).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    expect(google.challengeDe(v)).toBe(esperado);
    expect(v).not.toMatch(/[+/=]/); // base64url, seguro en una URL
  });

  test('cada intento genera un verifier distinto', () => {
    expect(google.crearVerifier()).not.toBe(google.crearVerifier());
  });

  test('/api/auth/google redirige a Supabase con PKCE y deja la cookie', async () => {
    const res = await request(app).get('/api/auth/google');
    expect(res.status).toBe(302);

    const destino = new URL(res.headers.location);
    expect(destino.searchParams.get('provider')).toBe('google');
    expect(destino.searchParams.get('code_challenge_method')).toBe('s256');
    expect(destino.searchParams.get('code_challenge')).toBeTruthy();
    expect(destino.searchParams.get('redirect_to')).toContain('/api/auth/callback');

    // El verifier tiene que quedar en cookie httpOnly, nunca en la URL.
    const cookies = String(res.headers['set-cookie']);
    expect(cookies).toContain('g_verifier');
    expect(cookies).toContain('HttpOnly');
    expect(destino.search).not.toContain('verifier');
  });

  test('el callback sin codigo no crea sesion', async () => {
    const res = await request(app).get('/api/auth/callback');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=');
    expect(String(res.headers['set-cookie'] || '')).not.toContain('session=');
  });

  test('el callback con codigo pero sin verifier es rechazado', async () => {
    const res = await request(app).get('/api/auth/callback?code=inventado');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=');
    expect(String(res.headers['set-cookie'] || '')).not.toContain('session=');
  });

  test('una cuenta sin password_hash no puede entrar por formulario', async () => {
    await db.query(
      "insert into usuarios (email, rol, google_id) values ($1, 'vendedor', $2)",
      ['solo.google@ferrefacil.com', 'gid-test-1']
    );
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'solo.google@ferrefacil.com', password: 'loquesea' });
    expect(res.status).toBe(401);
  });
});
