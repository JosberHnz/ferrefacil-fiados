const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  let dbOk = true;
  try {
    db.prepare('SELECT 1').get();
  } catch (e) {
    dbOk = false;
  }

  res.json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk,
    uptime_seconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
