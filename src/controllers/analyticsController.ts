import { Request, Response } from 'express';
import { pool } from '../config/db';
import { RowDataPacket } from 'mysql2';

function parseBrowser(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('edg/')) return 'Edge';
  if (ua.includes('chrome') && !ua.includes('edg/')) return 'Chrome';
  if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
  if (ua.includes('firefox')) return 'Firefox';
  return 'Other / Bot';
}

/**
 * GET /api/analytics/:code
 */
export async function getAnalytics(req: Request, res: Response): Promise<void> {
  const { code } = req.params;

  if (!code) {
    res.status(400).json({ error: 'Short code is required' });
    return;
  }

  try {
    // 1. Verify URL existence
    const [urlRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, short_code, original_url, created_at, expires_at FROM urls WHERE short_code = ? LIMIT 1',
      [code]
    );

    if (urlRows.length === 0) {
      res.status(404).json({ error: 'Short code not found' });
      return;
    }

    const urlInfo = urlRows[0];

    // 2. Fetch Clicks by Day
    const [clicksByDay] = await pool.query<RowDataPacket[]>(
      `SELECT DATE(clicked_at) as date, COUNT(*) as count
       FROM click_events
       WHERE short_code = ?
       GROUP BY DATE(clicked_at)
       ORDER BY date ASC`,
      [code]
    );

    // 3. Fetch Raw UA & Referrers for aggregation
    const [events] = await pool.query<RowDataPacket[]>(
      `SELECT user_agent, referrer, clicked_at
       FROM click_events
       WHERE short_code = ?
       ORDER BY clicked_at DESC`,
      [code]
    );

    const browserMap: Record<string, number> = {};
    const referrerMap: Record<string, number> = {};

    events.forEach((ev) => {
      const browser = parseBrowser(ev.user_agent || '');
      browserMap[browser] = (browserMap[browser] || 0) + 1;

      const ref = ev.referrer || 'Direct';
      referrerMap[ref] = (referrerMap[ref] || 0) + 1;
    });

    const browserBreakdown = Object.entries(browserMap).map(([browser, count]) => ({
      browser,
      count,
    }));

    const topReferrers = Object.entries(referrerMap)
      .map(([referrer, count]) => ({ referrer, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    res.json({
      url: {
        shortCode: urlInfo.short_code,
        originalUrl: urlInfo.original_url,
        createdAt: urlInfo.created_at,
        expiresAt: urlInfo.expires_at,
      },
      totalClicks: events.length,
      clicksPerDay: clicksByDay.map((row) => ({
        date: new Date(row.date).toISOString().split('T')[0],
        clicks: Number(row.count),
      })),
      browserBreakdown,
      topReferrers,
    });
  } catch (err) {
    console.error('Error fetching analytics:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
