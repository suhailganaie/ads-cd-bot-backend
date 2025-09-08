import { Bot, InlineKeyboard } from "grammy";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN missing");

export const bot = new Bot(token);

// /start welcome with WebApp button
bot.command("start", async (ctx) => {
  const payload = ctx.match ? String(ctx.match).trim() : "";
  const url = `https://t.me/ADS_Cd_bot/ADS${payload ? `?startapp=${encodeURIComponent(payload)}` : ""}`;
  const kb = new InlineKeyboard()
    .webApp("Open Mini App", url)
    .row()
    .text("Help", "help");
  await ctx.reply("Welcome to ADS BOT!\n• Earn points via tasks\n• Invite friends to boost rewards\nTap Open Mini App to begin.", { reply_markup: kb });
});

// Help callback
bot.callbackQuery("help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Help\n• Open the Mini App for tasks, invites, and withdrawals\n• Type /start anytime to see this menu");
});

// Start polling
export async function startBot() {
  await bot.start();
}
