import { config } from './config.js';
import * as db from './db.js';
import { createBot } from './bot/bot.js';
import { startServer } from './web/server.js';
import { startScheduler } from './scheduler.js';

db.load();
console.log(`[db] ${db.customers().length} customers loaded from ${config.dbPath}`);
console.log(`[ai] ${config.anthropicKey ? `Claude ${config.model}` : 'no ANTHROPIC_API_KEY: using the rule-based fallback only'}`);

startServer(config.port);
if (process.env.AUTOPILOT !== 'off') startScheduler();

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
  // Keep the dashboard alive if polling fails (e.g. 409: another copy of the bot is polling the same token).
  const poll = () => bot.start({ drop_pending_updates: true }).catch((err) => {
    const conflict = err?.error_code === 409;
    console.error(`[bot] polling stopped: ${err?.description || err?.message}. ${conflict ? 'Another copy of this bot is running somewhere (only one may poll). ' : ''}Retrying in 15s`);
    setTimeout(poll, 15_000);
  });
  poll();
  const stop = () => { bot.stop(); db.saveNow(); process.exit(0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
