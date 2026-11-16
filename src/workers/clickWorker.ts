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
const PROCESSING_KEY = 'clicks_processing';
const BATCH_SIZE = parseInt(process.env.CLICK_BATCH_SIZE || '100', 10);
const INTERVAL_MS = parseInt(process.env.CLICK_FLUSH_INTERVAL_MS || '10000', 10);
const MAX_CHUNKS_PER_TICK = 50; // Cap at 5,000 items per flush tick to prevent event loop starvation

let intervalId: NodeJS.Timeout | null = null;
let isFlushing = false;

/**
 * Reliable telemetry batch worker using Redis RPOPLPUSH.
 * Guarantees at-least-once ingestion: events remain in clicks_processing
 * until MySQL acknowledges the multi-row insert.
 *
 * Drains in a loop until the queue is empty each tick so bursts do not get capped at 10 clicks/sec.
 */
export async function flushClicks(): Promise<number> {
  if (isFlushing) return 0;
  isFlushing = true;
  let totalFlushed = 0;

  try {
    for (let chunk = 0; chunk < MAX_CHUNKS_PER_TICK; chunk++) {
      const rawItems: string[] = [];

      // 1. Recover stranded items from processing queue first (from prior crash/restart)
      const strandedCount = await redis.llen(PROCESSING_KEY);
      if (strandedCount > 0) {
        const stranded = await redis.lrange(PROCESSING_KEY, 0, BATCH_SIZE - 1);
        if (stranded && stranded.length > 0) {
          rawItems.push(...stranded);
        }
      }

      // 2. Transfer new items from incoming queue to processing queue
      const needed = BATCH_SIZE - rawItems.length;
      for (let i = 0; i < needed; i++) {
        const item = await redis.rpoplpush(QUEUE_KEY, PROCESSING_KEY);
        if (!item) break;
        rawItems.push(item);
      }

      if (rawItems.length === 0) {
        break; // Queue is completely drained
      }

      // 3. Parse telemetry payloads
      const records: Array<[string, string, string, string, string]> = [];
      for (const item of rawItems) {
        try {
          const parsed: ClickTelemetry = JSON.parse(item);
          records.push([
            parsed.short_code.substring(0, 32),
            parsed.ip_hash,
            (parsed.user_agent || 'Unknown').substring(0, 255),
            (parsed.referrer || 'Direct').substring(0, 255),
            parsed.clicked_at || new Date().toISOString().slice(0, 19).replace('T', ' '),
          ]);
        } catch {
          // Drop corrupted/unparseable garbage entries
        }
      }

      if (records.length > 0) {
        // 4. Atomic multi-row persistence to MySQL
        const sql = `
          INSERT INTO click_events (short_code, ip_hash, user_agent, referrer, clicked_at)
          VALUES ?
        `;
        await pool.query(sql, [records]);
      }

      // 5. Acknowledge and remove persisted records from processing queue
      await redis.ltrim(PROCESSING_KEY, rawItems.length, -1);
      totalFlushed += rawItems.length;

      // If fewer items than BATCH_SIZE were found, incoming queue is drained
      if (rawItems.length < BATCH_SIZE) {
        break;
      }
    }

    if (totalFlushed > 0) {
      console.log(`📊 [ClickWorker] Durably flushed ${totalFlushed} click event(s) to MySQL.`);
    }
  } catch (err) {
    // If MySQL fails, items remain safely in clicks_processing and will be retried next tick
    console.error('❌ [ClickWorker] Persistence error; items safely preserved in processing queue:', err);
  } finally {
    isFlushing = false;
  }

  return totalFlushed;
}

export function startClickWorker(): void {
  if (intervalId) return;

  console.log(`🚀 [ClickWorker] Durable batch worker started (every ${INTERVAL_MS / 1000}s, chunk <= ${BATCH_SIZE}, loop-draining).`);
  // Immediate recovery flush on startup
  flushClicks().catch(() => {});

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
