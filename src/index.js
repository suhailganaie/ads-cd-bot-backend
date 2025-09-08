import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';

import { corsMw } from './middleware/cors.js';
import { auth as optionalAuth, requireAuth } from './middleware/auth.js'; // new auth middlewares [web:2966][web:2955]

import { health } from './routes/health.js';
import { auth as authRoutes } from './routes/auth.js';
import { ads } from './routes/ads.js';
import { tasks } from './routes/tasks.js';
import { invite } from './routes/invite.js';
import { withdrawals } from './routes/withdrawals.js';

const app = express();

// Core middleware
app.use(helmet({ contentSecurityPolicy: false })); // security headers first [web:2966]
app.use(express.json());                           // body parser [web:2966]
app.use(corsMw);                                   // CORS before routes [web:2966]
app.use(optionalAuth);                             // attach req.user if Bearer present (non-blocking) [web:2955]

// Root landing
app.get('/', (_req, res) => res.send('ADS BOT API is running. Try /api/health'));

// Public routes
app.use('/api', health);
app.use('/api', authRoutes);

// App routes (some handlers may call requireAuth internally per-route)
app.use('/api', ads);
app.use('/api', tasks);
app.use('/api', invite);       // invite includes GET /invite/count (uses requireAuth inside)
app.use('/api', withdrawals);

// 404 JSON fallback
app.use((req, res) => res.status(404).json({ error: 'not_found' })); // consistent JSON shape [web:2923]

// Error handler (last)
app.use((err, _req, res, _next) => {
  console.error(err);
  const code = err.status || 400;
  res.status(code).json({ error: err.message || 'bad_request' });
}); // placement after all routes matches Express guidance [web:2923][web:2925]

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`API on :${port}`));
