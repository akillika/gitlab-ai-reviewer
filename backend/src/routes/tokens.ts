import { Router } from 'express';
import { configureTokens, getTokenStatus, removeTokens } from '../controllers/tokenController';
import { requireAuth } from '../middleware/auth';
import { validateTokenConfig } from '../middleware/validate';
import { rateLimiter } from '../middleware/rateLimiter';

const router = Router();

// POST /api/tokens/configure - Validate and save user tokens
router.post('/configure', requireAuth, rateLimiter(5, 60 * 1000), validateTokenConfig, configureTokens);

// GET /api/tokens/status - Check if tokens are configured
router.get('/status', requireAuth, getTokenStatus);

// DELETE /api/tokens - Remove all stored tokens
router.delete('/', requireAuth, removeTokens);

export default router;
