import { redis } from '../config/redis';
import { pool } from '../config/db';

export interface ClickTelemetry {
  short_code: string;
  ip_hash: string;
  user_agent: string;
  referrer: string;
  clicked_at: string;
}

const QUEUE_KEY = 'clicks_queue';
const BATCH_SIZE = parseInt(process.env.CLICK_BATCH_SIZE || '100', 10);
const INTERVAL_MS = parseInt(process.env.CLICK_FLUSH_INTERVAL_MS || '10000', 10);

let intervalId: NodeJS.Timeout | null = null;
let isFlushing = false;

export async function flushClicks(): Promise<number> {
  if (isFlushing) return 0;
  isFlushing = true;

  try {
    // 1. Pop up to BATCH_SIZE events using a Redis pipeline
    const pipeline = redis.pipeline();
    for (let i = 0; i < BATCH_SIZE; i++) {
      pipeline.rpop(QUEUE_KEY);
    }
    const results = await pipeline.exec();

    if (!results || results.length === 0) {
      isFlushing = false;
      return 0;
    }

    const records: Array<[string, string, string, string, string]> = [];
    for (const [err, item] of results) {
      if (!err && item && typeof item === 'string') {
        try {
          const parsed: ClickTelemetry = JSON.parse(item);
          records.push([
            parsed.short_code.substring(0, 32),
            parsed.ip_hash,
            parsed.user_agent.substring(0, 255),
            parsed.referrer.substring(0, 255),
            parsed.clicked_at,
          ]);
        } catch {
          // ignore malformed payloads
        }
      }
    }

    if (records.length === 0) {
      isFlushing = false;
      return 0;
    }

    // 2. Perform single multi-row bulk insert into MySQL
    const sql = `
      INSERT INTO click_events (short_code, ip_hash, user_agent, referrer, clicked_at)
      VALUES ?
    `;
    await pool.query(sql, [records]);

    console.log(`📊 [ClickWorker] Flushed ${records.length} click event(s) to MySQL.`);
    isFlushing = false;
    return records.length;
  } catch (err) {
    console.error('❌ [ClickWorker] Error flushing click batch:', err);
    isFlushing = false;
    return 0;
  }
}

export function startClickWorker(): void {
  if (intervalId) return;

  console.log(`🚀 [ClickWorker] Batch worker started (every ${INTERVAL_MS / 1000}s, batch <= ${BATCH_SIZE}).`);
  intervalId = setInterval(async () => {
    await flushClicks();
  }, INTERVAL_MS);
}

export function stopClickWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
