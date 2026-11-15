import { Router } from 'express';
import { redirectUrl } from '../controllers/urlController';

export const redirectRouter = Router();

// Fast Redirect Route (GET /:code)
redirectRouter.get('/:code', redirectUrl);
