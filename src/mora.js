/**
 * Calcula los dias de mora de un fiado.
 * - Si esta pagado, mora es 0 (ya no importa la fecha).
 * - Si la fecha de vencimiento es hoy o en el futuro, mora es 0.
 * - Si ya vencio, mora = dias transcurridos desde el vencimiento (piso en 0).
 *
 * @param {string} fechaVencimiento formato 'YYYY-MM-DD'
 * @param {string} estado 'pendiente' | 'parcial' | 'pagado'
 * @param {Date} hoy referencia de "ahora", inyectable para tests deterministicos
 */
function calcularMora(fechaVencimiento, estado, hoy = new Date()) {
  if (estado === 'pagado') return 0;

  const venc = new Date(fechaVencimiento + 'T00:00:00');
  const ref = new Date(hoy.toISOString().slice(0, 10) + 'T00:00:00');

  const diffMs = ref - venc;
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return diffDias > 0 ? diffDias : 0;
}

/** Saldo pendiente de un fiado dado su monto total y la suma de sus pagos. */
function calcularSaldo(monto, totalPagado) {
  const saldo = Number(monto) - Number(totalPagado || 0);
  return Math.round(saldo * 100) / 100;
}

module.exports = { calcularMora, calcularSaldo };
