const { calcularMora, calcularSaldo } = require('../src/mora');

describe('calcularMora', () => {
  test('calcula mora de 0 dias como cero', () => {
    const hoy = new Date('2026-08-17T12:00:00Z');
    expect(calcularMora('2026-08-17', 'pendiente', hoy)).toBe(0);
  });

  test('no hay mora si la fecha de vencimiento es futura', () => {
    const hoy = new Date('2026-08-01T12:00:00Z');
    expect(calcularMora('2026-08-17', 'pendiente', hoy)).toBe(0);
  });

  test('calcula dias de mora cuando ya vencio', () => {
    const hoy = new Date('2026-08-20T12:00:00Z');
    expect(calcularMora('2026-08-17', 'pendiente', hoy)).toBe(3);
  });

  test('un fiado pagado nunca tiene mora, sin importar la fecha', () => {
    const hoy = new Date('2026-09-01T12:00:00Z');
    expect(calcularMora('2026-08-17', 'pagado', hoy)).toBe(0);
  });

  test('un fiado parcial si acumula mora si esta vencido', () => {
    const hoy = new Date('2026-08-25T12:00:00Z');
    expect(calcularMora('2026-08-17', 'parcial', hoy)).toBe(8);
  });
});

describe('calcularSaldo', () => {
  test('resta lo pagado del monto total', () => {
    expect(calcularSaldo(500, 200)).toBe(300);
  });

  test('sin pagos, el saldo es el monto completo', () => {
    expect(calcularSaldo(500, undefined)).toBe(500);
  });

  test('redondea a 2 decimales', () => {
    expect(calcularSaldo(100.333, 33.111)).toBe(67.22);
  });
});
