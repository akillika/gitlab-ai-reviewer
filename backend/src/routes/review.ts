import { Router } from 'express';
import {
  runReview,
  getReviews,
  getReview,
  editComment,
  removeComment,
  postComment,
  postAllComments,
} from '../controllers/reviewController';
import { requireAuth } from '../middleware/auth';
import { validateMrUrl } from '../middleware/validate';
import { rateLimiter } from '../middleware/rateLimiter';

const router = Router();

// POST /api/reviews/run - Run AI review on MR
router.post('/run', requireAuth, rateLimiter(5, 60 * 1000), validateMrUrl, runReview);

// GET /api/reviews - List user's reviews
router.get('/', requireAuth, getReviews);

// GET /api/reviews/:reviewId - Get review with comments
router.get('/:reviewId', requireAuth, getReview);

// PATCH /api/reviews/:reviewId/comments/:commentId - Edit a comment
router.patch('/:reviewId/comments/:commentId', requireAuth, editComment);

// DELETE /api/reviews/:reviewId/comments/:commentId - Delete a comment
router.delete('/:reviewId/comments/:commentId', requireAuth, removeComment);

// POST /api/reviews/:reviewId/comments/:commentId/post - Post single comment to GitLab
router.post('/:reviewId/comments/:commentId/post', requireAuth, postComment);

// POST /api/reviews/:reviewId/post-all - Post all unposted comments to GitLab
router.post('/:reviewId/post-all', requireAuth, rateLimiter(3, 60 * 1000), postAllComments);

export default router;
