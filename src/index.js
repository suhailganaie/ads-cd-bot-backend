// src/index.js
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';

import { corsMw } from './middleware/cors.js';
import { auth as optionalAuth } from './middleware/auth.js';

import { health } from './routes/health.js';
import { auth as authRoutes } from './routes/auth.js';
import { ads } from './routes/ads.js';
import { tasks } from './routes/tasks.js';
import { invite } from './routes/invite.js';
import { withdrawals } from './routes/withdrawals.js';

import { startBot } from './bot.js'; // single source of truth for polling [web:3913][web:3908]

const app = express();

// Core middleware
app.use(helmet({ contentSecurityPolicy: false })); // [web:2966]
app.use(express.json()); // [web:2966]
app.use(corsMw); // [web:2966]
app.use(optionalAuth); // [web:2955]

// Root landing
app.get('/', (_req, res) => res.send('ADS BOT API is running. Try /api/health')); // [web:2966]

// Public routes
app.use('/api', health);
app.use('/api', authRoutes);

// App routes
app.use('/api', ads);
app.use('/api', tasks);
app.use('/api', invite);
app.use('/api', withdrawals);

// 404 JSON fallback
app.use((req, res) => res.status(404).json({ error: 'not_found' })); // [web:2923]

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  const code = err.status || 400;
  res.status(code).json({ error: err.message || 'bad_request' });
}); // [web:2923]

const port = process.env.PORT || 8080;

// Start HTTP server, then (optionally) start the bot from bot.js
app.listen(port, async () => {
  console.log(`API on :${port}`);
  try {
    if (process.env.ENABLE_BOT === '1') {
      await startBot(); // runs deleteWebhook + start() inside bot.js [web:3913][web:3908]
      console.log('Bot polling started.');
    } else {
      console.log('Bot disabled (set ENABLE_BOT=1 to enable).');
    }
  } catch (e) {
    console.error('Bot start failed', e);
  }
});
