import dns from 'node:dns';
import { config, redact } from './config.js';
import * as db from './db.js';
import { createBot } from './bot/bot.js';
import { startServer } from './web/server.js';
import { startScheduler } from './scheduler.js';
import { migrateSimulatedOutcomes } from './engine.js';
import { runtime } from './status.js';

// Cloud hosts often can't route IPv6 to Telegram (requests time out): try IPv4 first.
dns.setDefaultResultOrder('ipv4first');
// Any stray error is logged without the bot token instead of crashing with a dump that contains it.
process.on('unhandledRejection', (err) => console.error('[error]', redact(err)));
process.on('uncaughtException', (err) => console.error('[error]', redact(err)));

db.load();
console.log(`[db] ${db.customers().length} customers loaded from ${config.dbPath}`);
const migrated = migrateSimulatedOutcomes();
if (migrated) console.log(`[db] ${migrated} simulated outcomes recomputed from ground truth`);
console.log(`[ai] ${config.anthropicKey ? `Claude ${config.model}` : 'no ANTHROPIC_API_KEY: using the rule-based fallback only'}`);

startServer(config.port);
if (process.env.AUTOPILOT !== 'off') startScheduler();

if (!config.telegramToken) {
  console.warn('[bot] TELEGRAM_BOT_TOKEN is missing: dashboard only. Add it to .env (see .env.example).');
} else {
  const bot = createBot(config.telegramToken);
  runtime.bot = 'connecting';
  const COMMANDS = [
    { command: 'start', description: 'Set up or show your shopper profile' },
    { command: 'menu', description: 'Browse, cart, offers' },
    { command: 'offer', description: 'Ask the engine for an offer' },
    { command: 'why', description: 'Why did I get my last offer?' },
    { command: 'mycoupons', description: 'Your coupons' },
    { command: 'stop', description: 'Stop all offers' },
    { command: 'resume', description: 'Turn offers back on' },
    { command: 'help', description: 'How this works' },
  ];
  // Keep the dashboard alive if Telegram is unreachable or another copy of the bot is polling (409): retry.
  const poll = () => bot.start({ drop_pending_updates: true, onStart: () => { runtime.bot = 'connected'; } }).catch((err) => {
    const conflict = err?.error_code === 409;
    runtime.bot = conflict ? 'conflict' : 'reconnecting';
    console.error(`[bot] polling stopped: ${redact(err?.description || err)}. ${conflict ? 'Another copy of this bot is running somewhere (only one may poll). ' : ''}Retrying in 15s`);
    setTimeout(poll, 15_000);
  });
  const connect = async (attempt = 1) => {
    try {
      const me = await bot.api.getMe();
      await bot.api.setMyCommands(COMMANDS).catch(() => {});
      console.log(`[bot] running as @${me.username}  ->  https://t.me/${me.username}`);
      Object.assign(runtime, { bot: 'connected', botUsername: me.username, botSince: new Date().toISOString() });
      poll();
    } catch (err) {
      const wait = Math.min(60, 5 * attempt);
      console.error(`[bot] can't reach Telegram yet (${redact(err)}). Dashboard stays up; retrying in ${wait}s`);
      setTimeout(() => connect(attempt + 1), wait * 1000);
    }
  };
  connect();
  const stop = () => { bot.stop(); db.saveNow(); process.exit(0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
