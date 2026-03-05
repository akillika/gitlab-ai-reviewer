import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getIndexStatus,
  triggerIndexing,
  getHealth,
  getSettings,
  updateSettings,
} from '../controllers/repoController';

const router = Router();

router.get('/index-status', requireAuth, getIndexStatus);
router.post('/trigger-index', requireAuth, triggerIndexing);
router.get('/health', requireAuth, getHealth);
router.get('/settings', requireAuth, getSettings);
router.post('/settings', requireAuth, updateSettings);

export default router;
