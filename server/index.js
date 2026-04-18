'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
const { testConnection } = require('./db/connection');

const app = express();

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'], credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many login attempts, please try again later' } }));
app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 300 }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',   require('./routes/auth'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/users',  require('./routes/users'));
app.use('/api/views',  require('./routes/views'));

// Health check
app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', datasource: 'azure-sql', timestamp: new Date().toISOString() })
);

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

app.listen(PORT, async () => {
  console.log(`\n🚀  AML Case Manager API  →  http://localhost:${PORT}`);
  console.log(`📋  Datasource: ${process.env.REACT_APP_DATASOURCE || 'mock'}\n`);

  if (process.env.REACT_APP_DATASOURCE === 'azure-sql') {
    await testConnection();
  } else {
    console.log('ℹ️   Running in MOCK mode — set REACT_APP_DATASOURCE=azure-sql in .env for live DB\n');
  }
});
