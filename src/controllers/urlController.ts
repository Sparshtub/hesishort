import { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../config/db';
import { redis } from '../config/redis';
import { encodeBase62 } from '../utils/base62';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

const MAX_CACHE_TTL_SECONDS = 86400; // 24 hours maximum
const RESERVED_ALIASES = new Set([
  'api',
  'health',
  'favicon.ico',
  'robots.txt',
  'dashboard',
  'public',
  'static',
  'admin',
  'metrics',
  'index.html',
  'logo.svg',
  'favicon.svg',
]);

/**
 * Validates protocol and rejects redirect loops pointing back to HesiShort.
 */
function validateUrl(urlString: string, req: Request): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, reason: 'URL must use http:// or https:// protocol.' };
    }

    const targetHost = parsed.hostname.toLowerCase();
    const currentHost = (req.get('host') || '').toLowerCase().split(':')[0];
    const selfHosts = ['localhost', '127.0.0.1', 'hesishort.onrender.com', currentHost];

    if (selfHosts.includes(targetHost)) {
      return { valid: false, reason: 'Destination URL cannot point to HesiShort itself (prevents redirect loops).' };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Invalid destination URL format.' };
  }
}

/**
 * Computes safe cache TTL: min(24h, remaining lifetime).
 * Prevents caching expired links past their expiresAt boundary.
 */
function computeCacheTtlSeconds(expiresAt: Date | string | null): number {
  if (!expiresAt) return MAX_CACHE_TTL_SECONDS;
  const expiryMs = new Date(expiresAt).getTime();
  const remainingSeconds = Math.floor((expiryMs - Date.now()) / 1000);
  if (remainingSeconds <= 0) return 0; // Already expired
  return Math.min(MAX_CACHE_TTL_SECONDS, remainingSeconds);
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

  if (!url) {
    res.status(400).json({ error: 'URL is required.' });
    return;
  }

  const validation = validateUrl(url, req);
  if (!validation.valid) {
    res.status(400).json({ error: validation.reason });
    return;
  }

  let finalShortCode = '';
  let expirationDate: Date | null = null;

  if (expiresAt) {
    expirationDate = new Date(expiresAt);
    if (isNaN(expirationDate.getTime()) || expirationDate <= new Date()) {
      res.status(400).json({ error: 'expiresAt must be a valid future ISO datetime string.' });
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

      if (RESERVED_ALIASES.has(aliasClean.toLowerCase())) {
        res.status(400).json({ error: `"${aliasClean}" is a reserved system route and cannot be used as an alias.` });
        return;
      }

      // Check if alias is already claimed
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
      // Insert with a collision-free temporary placeholder
      const tempPlaceholder = `_t${crypto.randomBytes(4).toString('hex')}`;
      const [insertResult] = await pool.query<ResultSetHeader>(
        'INSERT INTO urls (short_code, original_url, expires_at) VALUES (?, ?, ?)',
        [tempPlaceholder, url, expirationDate]
      );

      const insertId = insertResult.insertId;
      finalShortCode = encodeBase62(insertId);

      // Guard: Check if a user previously claimed this exact short_code as a custom alias
      const [aliasCollision] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM urls WHERE short_code = ? AND id != ? LIMIT 1',
        [finalShortCode, insertId]
      );

      if (aliasCollision.length > 0) {
        // Fallback salt to prevent duplicate key exception
        finalShortCode = `${finalShortCode}_${crypto.randomBytes(2).toString('hex')}`;
      }

      await pool.query('UPDATE urls SET short_code = ? WHERE id = ?', [finalShortCode, insertId]);
    }

    // Warm cache in Redis with safe expiry-bounded TTL
    const cacheTtl = computeCacheTtlSeconds(expirationDate);
    if (cacheTtl > 0) {
      await redis.setex(`url:${finalShortCode}`, cacheTtl, url);
    }

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

    res.status(201).json({
      shortUrl: `${baseUrl}/${finalShortCode}`,
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
 * Fast Redirect with Expiry-Aware Cache-Aside and Async Ingestion
 */
export async function redirectUrl(req: Request, res: Response): Promise<void> {
  const code = req.params.code;

  if (!code || code === 'favicon.ico' || code === 'robots.txt') {
    res.status(204).end();
    return;
  }

  try {
    // Client IP respecting trusted reverse proxies (Render / Cloudflare)
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const ipString = Array.isArray(clientIp) ? clientIp[0] : clientIp;
    const ipHash = hashIp(ipString);
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

    // Check expiration before redirecting
    if (expires_at && new Date(expires_at) < new Date()) {
      res.status(410).send('This short link has expired.');
      return;
    }

    // 4. Populate Redis Cache bounded by remaining link lifetime
    const cacheTtl = computeCacheTtlSeconds(expires_at);
    if (cacheTtl > 0) {
      await redis.setex(`url:${code}`, cacheTtl, original_url);
    }

    res.setHeader('X-Cache', 'MISS');
    res.redirect(302, original_url);
  } catch (err) {
    console.error('Redirect error:', err);
    res.status(500).send('Internal Server Error');
  }
}
