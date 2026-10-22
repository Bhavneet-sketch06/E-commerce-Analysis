import { Bot } from 'grammy';

export function createBot(token) {
  const bot = new Bot(token);

  bot.command('start', (ctx) =>
    ctx.reply(
      `Namaste ${ctx.from?.first_name || ''}! 👋\n\nI'm the <b>Offer Engine</b> bot. Soon I'll send you deals picked just for you.\nStay tuned!`,
      { parse_mode: 'HTML' },
    ),
  );

  bot.catch((err) => console.error('[bot] error:', err.error));
  return bot;
}
