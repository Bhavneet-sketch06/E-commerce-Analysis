import { config } from './config.js';
import { createBot } from './bot/bot.js';

if (!config.telegramToken) {
  console.error('TELEGRAM_BOT_TOKEN is missing. Copy .env.example to .env and add your token from @BotFather.');
  process.exit(1);
}

const bot = createBot(config.telegramToken);
const me = await bot.api.getMe();
console.log(`[bot] running as @${me.username}  ->  https://t.me/${me.username}`);
bot.start({ drop_pending_updates: true });

process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
