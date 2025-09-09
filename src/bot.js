// src/bot.js
import { Bot, InlineKeyboard } from 'grammy';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN missing'); // required for grammY [4]

export const bot = new Bot(token);

// Build Mini App URL (prefer public web app URL over t.me deep link)
const MINI_APP_URL =
  process.env.MINI_APP_URL || 'https://ads-cd-bot-frontend.vercel.app/'; // HTTPS URL for WebApp button 

// Global error handler
bot.catch((err) => {
  console.error('Bot error:', err);
}); // recommended by grammY [4]

// /start with WebApp button
bot.command('start', async (ctx) => {
  const payload = ctx.match ? String(ctx.match).trim() : '';
  const url = MINI_APP_URL + (payload ? `?startapp=${encodeURIComponent(payload)}` : '');
  const kb = new InlineKeyboard().webApp('Open Mini App', url).row().text('Help', 'help');
  await ctx.reply(
    'Welcome to ADS BOT!\n• Earn points via tasks\n• Invite friends to boost rewards\nTap Open Mini App to begin.',
    { reply_markup: kb }
  );
}); // clean entrypoint with payload passthrough 

// Help callback
bot.callbackQuery('help', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    'Help\n• Use the Mini App to see tasks, invites, and withdrawals\n• Type /start anytime to get this menu again'
  );
}); // inline callback flow 

// Single long-polling loop
export async function startBot() {
  // Ensure no webhook is set before polling to prevent 409
  await bot.api.deleteWebhook({ drop_pending_updates: false }).catch(() => {}); // clears webhook if previously set [4]
  await bot.start(); // start long polling once per deployment/instance [3]
}
