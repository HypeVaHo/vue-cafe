import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { testConnection } from './config/database.js';

// Load server/.env relative to THIS module, regardless of CWD.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// Import routes
import authRoutes from './routes/auth.js';
import productsRoutes from './routes/products.js';
import categoriesRoutes from './routes/categories.js';
import ordersRoutes from './routes/orders.js';
import usersRoutes from './routes/users.js';
import analyticsRoutes from './routes/analytics.js';
import settingsRoutes from './routes/settings.js';

const app = express();
const PORT = process.env.PORT || 3000;

// DB state (updated during startup)
let dbConnected = false;

// Middleware
// CORS: в dev разрешаем любой localhost-источник; для деплоя — GitHub Pages
// и дополнительные домены из .env (CORS_ORIGINS через запятую).
function isAllowedOrigin(origin) {
  if (!origin) return true; // curl/same-origin запросы без Origin
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    // GitHub Pages: https://<user>.github.io
    if (host.endsWith('.github.io')) return true;
    const extra = (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (extra.includes(origin.toLowerCase())) return true;
    return false;
  } catch {
    return false;
  }
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Явная обработка preflight (OPTIONS) для всех маршрутов
app.options('*', cors());

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: dbConnected ? 'connected' : 'unavailable',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

// Start server
async function start() {
  // Try to connect to the database, but keep the HTTP server up either way.
  try {
    dbConnected = await testConnection();
  } catch (error) {
    console.error('DB check failed:', error.message);
    dbConnected = false;
  }

  if (dbConnected) {
    console.log('=== База данных: подключена ===');
  } else {
    console.warn('=== База данных НЕДОСТУПНА ===');
    console.warn('API-эндпоинты, работающие с БД, будут возвращать 500, пока SQL Server недоступен.');
    console.warn(`Проверьте .env (MSSQL_SERVER=${process.env.MSSQL_SERVER}, MSSQL_DATABASE=${process.env.MSSQL_DATABASE}).`);
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Frontend URL: ${process.env.FRONTEND_URL}`);
  });
}

start();
