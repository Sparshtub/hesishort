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

let intervalId: NodeJS.Timeout | null = null;
let isFlushing = false;

/**
 * Reliable telemetry batch flush using Redis RPOPLPUSH / LMOVE.
 * Guarantees at-least-once ingestion: events remain in clicks_processing
 * until MySQL acknowledges the multi-row insert.
 */
export async function flushClicks(): Promise<number> {
  if (isFlushing) return 0;
  isFlushing = true;

  try {
    const rawItems: string[] = [];

    // 1. First recover any stranded items from a previous crash/restart
    const strandedCount = await redis.llen(PROCESSING_KEY);
    if (strandedCount > 0) {
      const stranded = await redis.lrange(PROCESSING_KEY, 0, BATCH_SIZE - 1);
      if (stranded && stranded.length > 0) {
        rawItems.push(...stranded);
      }
    }

    // 2. Transfer new items from incoming queue to processing queue
    const remainingToFetch = BATCH_SIZE - rawItems.length;
    for (let i = 0; i < remainingToFetch; i++) {
      const item = await redis.rpoplpush(QUEUE_KEY, PROCESSING_KEY);
      if (!item) break;
      rawItems.push(item);
    }

    if (rawItems.length === 0) {
      isFlushing = false;
      return 0;
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
        // Drop unparseable garbage entries
      }
    }

    if (records.length === 0) {
      // Clear malformed entries from processing queue
      await redis.ltrim(PROCESSING_KEY, rawItems.length, -1);
      isFlushing = false;
      return 0;
    }

    // 4. Atomic multi-row persistence to MySQL
    const sql = `
      INSERT INTO click_events (short_code, ip_hash, user_agent, referrer, clicked_at)
      VALUES ?
    `;
    await pool.query(sql, [records]);

    // 5. Acknowledge and remove persisted records from processing queue
    await redis.ltrim(PROCESSING_KEY, rawItems.length, -1);

    console.log(`📊 [ClickWorker] Durably flushed ${records.length} click event(s) to MySQL.`);
    isFlushing = false;
    return records.length;
  } catch (err) {
    // Note: If MySQL fails, items remain in clicks_processing and will be retried next interval
    console.error('❌ [ClickWorker] Persistence error; items safely preserved in processing queue:', err);
    isFlushing = false;
    return 0;
  }
}

export function startClickWorker(): void {
  if (intervalId) return;

  console.log(`🚀 [ClickWorker] Durable batch worker started (every ${INTERVAL_MS / 1000}s, batch <= ${BATCH_SIZE}).`);
  // Immediate recovery check on startup
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
