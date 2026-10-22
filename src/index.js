import { config } from './config.js';
import * as db from './db.js';
import { createBot } from './bot/bot.js';
import { startServer } from './web/server.js';

db.load();
console.log(`[db] ${db.customers().length} customers loaded from ${config.dbPath}`);
console.log(`[ai] ${config.anthropicKey ? `Claude ${config.model}` : 'no ANTHROPIC_API_KEY: using the rule-based fallback only'}`);

startServer(config.port);

if (!config.telegramToken) {
  console.warn('[bot] TELEGRAM_BOT_TOKEN is missing: dashboard only. Add it to .env (see .env.example).');
} else {
  const bot = createBot(config.telegramToken);
  const me = await bot.api.getMe();
  await bot.api.setMyCommands([
    { command: 'start', description: 'Set up or show your shopper profile' },
    { command: 'menu', description: 'Browse, cart, offers' },
    { command: 'offer', description: 'Ask the engine for an offer' },
    { command: 'why', description: 'Why did I get my last offer?' },
    { command: 'mycoupons', description: 'Your coupons' },
    { command: 'stop', description: 'Stop all offers' },
    { command: 'resume', description: 'Turn offers back on' },
    { command: 'help', description: 'How this works' },
  ]);
  console.log(`[bot] running as @${me.username}  ->  https://t.me/${me.username}`);
  bot.start({ drop_pending_updates: true });
  const stop = () => { bot.stop(); db.saveNow(); process.exit(0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
