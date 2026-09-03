const path = require('path');
const fs = require('fs');

// Usar una base de datos de pruebas separada, aislada de la de desarrollo.
const TEST_DB = path.join(__dirname, 'test.db');
process.env.DB_PATH = TEST_DB;

// Borra la base y sus archivos WAL. Windows no permite borrar un archivo
// abierto, asi que esto corre antes de que db.js abra la conexion, y el
// cierre de afterAll pasa antes del borrado final.
function limpiarDB() {
  for (const f of [TEST_DB, TEST_DB + '-wal', TEST_DB + '-shm']) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}

limpiarDB();

const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');

afterAll(() => {
  db.close();
  limpiarDB();
});

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
