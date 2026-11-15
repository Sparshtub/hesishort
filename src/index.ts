import express from 'express';
import dotenv from 'dotenv';
import { checkDbConnection, pool } from './config/db';
import { redis } from './config/redis';
import { apiRouter } from './routes/api';
import { redirectRouter } from './routes/redirect';
import { startClickWorker, stopClickWorker, flushClicks } from './workers/clickWorker';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Trust proxy for Render / Cloud reverse proxies (proper IP & HTTPS detection)
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const redisPing = await redis.ping();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        redis: redisPing === 'PONG' ? 'up' : 'down',
        mysql: 'connected',
      },
    });
  } catch (err: any) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// Serve frontend dashboard
app.use(express.static('public'));

// Routes
app.use('/api', apiRouter);
app.use('/', redirectRouter);

// Start server and worker
async function bootstrap() {
  await checkDbConnection();
  startClickWorker();

  const server = app.listen(PORT, () => {
    console.log(`🚀 SnapLink API running on http://localhost:${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Gracefully shutting down...`);
    stopClickWorker();
    server.close(async () => {
      console.log('📦 Flushing remaining click events to MySQL...');
      await flushClicks();
      await pool.end();
      redis.disconnect();
      console.log('✅ Shutdown completed cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
