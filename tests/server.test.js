import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { config } from '../src/config.js';
import * as db from '../src/db.js';
import { createApp } from '../src/web/server.js';

let server;
let base;
const saved = config.dashboardPassword;

beforeAll(async () => {
  db.load(':memory:', { populationSize: 50 });
  config.dashboardPassword = 'test-pass';
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});
afterAll(() => {
  server?.close();
  config.dashboardPassword = saved;
});

describe('dashboard password', () => {
  it('keeps the health check public for the hosting platform', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
  it('locks everything else', async () => {
    expect((await fetch(`${base}/api/overview`)).status).toBe(401);
    expect((await fetch(`${base}/api/rules`)).status).toBe(401);
    expect((await fetch(`${base}/`)).status).toBe(401);
  });
  it('lets the right password in', async () => {
    const headers = { Authorization: `Basic ${Buffer.from('marketing:test-pass').toString('base64')}` };
    expect((await fetch(`${base}/api/overview`, { headers })).status).toBe(200);
    const wrong = { Authorization: `Basic ${Buffer.from('marketing:nope').toString('base64')}` };
    expect((await fetch(`${base}/api/overview`, { headers: wrong })).status).toBe(401);
  });
});
