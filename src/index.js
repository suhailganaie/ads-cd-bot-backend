import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { corsMw } from './middleware/cors.js';
app.use(corsMw);
import { health } from './routes/health.js';
import { auth as authRoutes } from './routes/auth.js';
import { ads } from './routes/ads.js';
import { tasks } from './routes/tasks.js';
import { invite } from './routes/invite.js';
import { withdrawals } from './routes/withdrawals.js';

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(corsMw);

app.use('/api', health);
app.use('/api', authRoutes);
app.use('/api', ads);
app.use('/api', tasks);
app.use('/api', invite);
app.use('/api', withdrawals);

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: err.message || 'bad_request' });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`API on :${port}`));
