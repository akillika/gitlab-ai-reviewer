import { Router } from 'express';
import { register, login, getMe } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';
import { validateRegistration, validateLogin } from '../middleware/validate';
import { rateLimiter } from '../middleware/rateLimiter';

const router = Router();

// POST /api/auth/register
router.post('/register', rateLimiter(5, 60 * 1000), validateRegistration, register);

// POST /api/auth/login
router.post('/login', rateLimiter(10, 60 * 1000), validateLogin, login);

// GET /api/auth/me
router.get('/me', requireAuth, getMe);

export default router;
