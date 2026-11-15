import { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../config/db';
import { redis } from '../config/redis';
import { encodeBase62 } from '../utils/base62';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

const CACHE_TTL_SECONDS = 86400; // 24 hours
const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

function isValidUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

/**
 * POST /api/shorten
 * Body: { url: string, customAlias?: string, expiresAt?: string }
 */
export async function shortenUrl(req: Request, res: Response): Promise<void> {
  const { url, customAlias, expiresAt } = req.body;

  if (!url || !isValidUrl(url)) {
    res.status(400).json({ error: 'Invalid or missing URL. URL must start with http:// or https://' });
    return;
  }

  let finalShortCode = '';
  let expirationDate: Date | null = null;

  if (expiresAt) {
    expirationDate = new Date(expiresAt);
    if (isNaN(expirationDate.getTime()) || expirationDate <= new Date()) {
      res.status(400).json({ error: 'expiresAt must be a valid future ISO datetime string' });
      return;
    }
  }

  try {
    if (customAlias) {
      const aliasClean = customAlias.trim();
      if (!/^[a-zA-Z0-9_-]{3,20}$/.test(aliasClean)) {
        res.status(400).json({ error: 'Custom alias must be 3-20 alphanumeric characters (or _, -).' });
        return;
      }

      // Check if alias exists
      const [existing] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM urls WHERE short_code = ? LIMIT 1',
        [aliasClean]
      );
      if (existing.length > 0) {
        res.status(409).json({ error: 'Custom alias is already in use.' });
        return;
      }

      finalShortCode = aliasClean;
      await pool.query(
        'INSERT INTO urls (short_code, original_url, expires_at) VALUES (?, ?, ?)',
        [finalShortCode, url, expirationDate]
      );
    } else {
      // Auto-increment ID + Base62 encoding
      // First insert with a unique placeholder short_code to satisfy UNIQUE constraint
      const tempPlaceholder = `_t${crypto.randomBytes(4).toString('hex')}`;
      const [insertResult] = await pool.query<ResultSetHeader>(
        'INSERT INTO urls (short_code, original_url, expires_at) VALUES (?, ?, ?)',
        [tempPlaceholder, url, expirationDate]
      );

      const insertId = insertResult.insertId;
      // Encode ID to Base62 (table AUTO_INCREMENT is offset by 100000, so short_code starts >= 4 chars)
      finalShortCode = encodeBase62(insertId);

      await pool.query('UPDATE urls SET short_code = ? WHERE id = ?', [finalShortCode, insertId]);
    }

    // Warm cache in Redis
    await redis.setex(`url:${finalShortCode}`, CACHE_TTL_SECONDS, url);

    res.status(201).json({
      shortUrl: `${BASE_URL}/${finalShortCode}`,
      shortCode: finalShortCode,
      originalUrl: url,
      expiresAt: expirationDate ? expirationDate.toISOString() : null,
    });
  } catch (err: any) {
    console.error('Error creating short URL:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

/**
 * GET /:code
 * Fast Redirect with Cache-Aside and Async Ingestion
 */
export async function redirectUrl(req: Request, res: Response): Promise<void> {
  const code = req.params.code;

  if (!code || code === 'favicon.ico' || code === 'robots.txt') {
    res.status(204).end();
    return;
  }

  try {
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const clientIp = Array.isArray(rawIp) ? rawIp[0] : rawIp;
    const ipHash = hashIp(clientIp);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const referrer = req.headers['referer'] || req.headers['referrer'] || 'Direct';

    // 1. Asynchronous Telemetry Ingestion (Non-blocking LPUSH to Redis)
    const telemetryPayload = JSON.stringify({
      short_code: code,
      ip_hash: ipHash,
      user_agent: userAgent,
      referrer: referrer,
      clicked_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });
    // Fire-and-forget push to Redis queue
    redis.lpush('clicks_queue', telemetryPayload).catch((err) => {
      console.error('Telemetry queue push error:', err);
    });

    // 2. Cache-Aside Lookup in Redis
    const cachedUrl = await redis.get(`url:${code}`);
    if (cachedUrl) {
      res.setHeader('X-Cache', 'HIT');
      res.redirect(302, cachedUrl);
      return;
    }

    // 3. Cache Miss: Query MySQL
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT original_url, expires_at FROM urls WHERE short_code = ? LIMIT 1',
      [code]
    );

    if (rows.length === 0) {
      res.status(404).send('Short link not found.');
      return;
    }

    const { original_url, expires_at } = rows[0];

    // Check expiration
    if (expires_at && new Date(expires_at) < new Date()) {
      res.status(410).send('This short link has expired.');
      return;
    }

    // 4. Populate Redis Cache with 24-hr TTL
    await redis.setex(`url:${code}`, CACHE_TTL_SECONDS, original_url);

    res.setHeader('X-Cache', 'MISS');
    res.redirect(302, original_url);
  } catch (err) {
    console.error('Redirect error:', err);
    res.status(500).send('Internal Server Error');
  }
}
