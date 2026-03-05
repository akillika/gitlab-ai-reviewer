import { Router } from 'express';
import { fetchMergeRequest } from '../controllers/mrController';
import { requireAuth } from '../middleware/auth';
import { validateMrUrl } from '../middleware/validate';

const router = Router();

// POST /api/mr/fetch - Fetch MR details
router.post('/fetch', requireAuth, validateMrUrl, fetchMergeRequest);

export default router;
