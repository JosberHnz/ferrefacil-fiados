const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  let dbOk = true;
  try {
    await db.query('select 1');
  } catch (e) {
    dbOk = false;
  }

  res.json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk,
    motor: 'postgres',
    uptime_seconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
