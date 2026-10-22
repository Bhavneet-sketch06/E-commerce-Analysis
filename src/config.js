import 'dotenv/config';

const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
  adminIds: list(process.env.ADMIN_TELEGRAM_IDS),
  dashboardPassword: process.env.DASHBOARD_PASSWORD || '',
  port: Number(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH || './data/offers.db.json',
};
