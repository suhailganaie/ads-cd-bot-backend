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

// --- Bot (long polling) ---
import { Bot, InlineKeyboard } from 'grammy'; // grammY core [web:3563][web:3550]

const app = express();

// Core middleware
app.use(helmet({ contentSecurityPolicy: false })); // [web:2966]
app.use(express.json());                           // [web:2966]
app.use(corsMw);                                   // [web:2966]
app.use(optionalAuth);                             // [web:2955]

// Root landing
app.get('/', (_req, res) => res.send('ADS BOT API is running. Try /api/health'));

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

// -------- Start server and bot (long polling) --------
const port = process.env.PORT || 8080;

// Optional bot boot via long polling (simple)
async function bootBotIfEnabled() {
  if (process.env.ENABLE_BOT !== '1') {
    console.log('Bot disabled (set ENABLE_BOT=1 to enable).'); 
    return;
  }
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.warn('ENABLE_BOT=1 but BOT_TOKEN is missing, skipping bot start.');
    return;
  }

  const bot = new Bot(token); // grammY bot instance [web:3563]

  // /start welcome
  bot.command('start', async (ctx) => {
    const payload = ctx.match ? String(ctx.match).trim() : '';
    const url = `https://t.me/ADS_Cd_bot/ADS${payload ? `?startapp=${encodeURIComponent(payload)}` : ''}`;
    const kb = new InlineKeyboard()
      .webApp('Open Mini App', url)
      .row()
      .text('Help', 'help');
    await ctx.reply(
      'Welcome to ADS BOT!\n• Earn points via tasks\n• Invite friends to boost rewards\nTap Open Mini App to begin.',
      { reply_markup: kb }
    );
  });

  bot.callbackQuery('help', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      'Help\n• Use the Mini App to see tasks, invites, and withdrawals\n• Type /start anytime to get this menu again'
    );
  });

  // Start long polling (simple)
  bot.start().then(() => {
    console.log('Bot polling started.');
  }).catch((e) => {
    console.error('Bot start failed', e);
  }); // Simple long polling per grammY docs. [web:3550][web:3563]
}

app.listen(port, () => {
  console.log(`API on :${port}`);
  bootBotIfEnabled().catch(console.error);
});
