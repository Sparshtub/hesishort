import { Router } from 'express';
import { shortenUrl } from '../controllers/urlController';
import { getAnalytics } from '../controllers/analyticsController';
import { rateLimiter } from '../middleware/rateLimiter';

export const apiRouter = Router();

// Rate limited link shortening endpoint
apiRouter.post('/shorten', rateLimiter, shortenUrl);

// Analytics endpoint
apiRouter.get('/analytics/:code', getAnalytics);
