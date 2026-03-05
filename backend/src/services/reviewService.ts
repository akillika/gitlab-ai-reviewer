import { query } from '../utils/db';

interface ReviewRow {
  [key: string]: unknown;
  id: number;
  user_id: number;
  project_id: number;
  project_path: string;
  mr_iid: number;
  mr_title: string;
  status: string;
  created_at: Date;
}

interface ReviewCommentRow {
  [key: string]: unknown;
  id: number;
  review_id: number;
  file_path: string;
  line_number: number;
  severity: string;
  comment: string;
  posted: boolean;
  gitlab_note_id: number | null;
  created_at: Date;
  updated_at: Date;
}

export async function createReview(params: {
  userId: number;
  projectId: number;
  projectPath: string;
  mrIid: number;
  mrTitle: string;
}): Promise<ReviewRow> {
  const result = await query<ReviewRow>(
    `INSERT INTO reviews (user_id, project_id, project_path, mr_iid, mr_title, status)
     VALUES ($1, $2, $3, $4, $5, 'completed')
     RETURNING *`,
    [params.userId, params.projectId, params.projectPath, params.mrIid, params.mrTitle]
  );
  return result.rows[0];
}

export async function saveReviewComments(
  reviewId: number,
  comments: Array<{ file_path: string; line_number: number; severity: string; comment: string }>
): Promise<ReviewCommentRow[]> {
  if (comments.length === 0) return [];

  const values: unknown[] = [];
  const placeholders: string[] = [];

  comments.forEach((c, i) => {
    const offset = i * 4;
    placeholders.push(`($1, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
    values.push(c.file_path, c.line_number, c.severity, c.comment);
  });

  // Build a simpler query using individual inserts for reliability
  const insertedComments: ReviewCommentRow[] = [];
  for (const comment of comments) {
    const result = await query<ReviewCommentRow>(
      `INSERT INTO review_comments (review_id, file_path, line_number, severity, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [reviewId, comment.file_path, comment.line_number, comment.severity, comment.comment]
    );
    insertedComments.push(result.rows[0]);
  }

  return insertedComments;
}

export async function getReviewsByUser(userId: number): Promise<ReviewRow[]> {
  const result = await query<ReviewRow>(
    `SELECT * FROM reviews WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  return result.rows;
}

export async function getReviewWithComments(
  reviewId: number,
  userId: number
): Promise<{ review: ReviewRow; comments: ReviewCommentRow[] } | null> {
  const reviewResult = await query<ReviewRow>(
    'SELECT * FROM reviews WHERE id = $1 AND user_id = $2',
    [reviewId, userId]
  );
  if (reviewResult.rows.length === 0) return null;

  const commentsResult = await query<ReviewCommentRow>(
    'SELECT * FROM review_comments WHERE review_id = $1 ORDER BY file_path, line_number',
    [reviewId]
  );

  return {
    review: reviewResult.rows[0],
    comments: commentsResult.rows,
  };
}

export async function updateComment(
  commentId: number,
  reviewId: number,
  userId: number,
  updates: { comment?: string; severity?: string }
): Promise<ReviewCommentRow | null> {
  // Verify ownership
  const ownerCheck = await query(
    `SELECT rc.id FROM review_comments rc
     JOIN reviews r ON rc.review_id = r.id
     WHERE rc.id = $1 AND rc.review_id = $2 AND r.user_id = $3`,
    [commentId, reviewId, userId]
  );
  if (ownerCheck.rows.length === 0) return null;

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.comment !== undefined) {
    setClauses.push(`comment = $${paramIndex++}`);
    values.push(updates.comment);
  }
  if (updates.severity !== undefined) {
    setClauses.push(`severity = $${paramIndex++}`);
    values.push(updates.severity);
  }

  if (setClauses.length === 0) return null;

  setClauses.push(`updated_at = NOW()`);
  values.push(commentId);

  const result = await query<ReviewCommentRow>(
    `UPDATE review_comments SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

export async function deleteComment(
  commentId: number,
  reviewId: number,
  userId: number
): Promise<boolean> {
  // Verify ownership
  const result = await query(
    `DELETE FROM review_comments
     WHERE id = $1 AND review_id = $2
     AND review_id IN (SELECT id FROM reviews WHERE user_id = $3)`,
    [commentId, reviewId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markCommentPosted(
  commentId: number,
  gitlabNoteId: number
): Promise<void> {
  await query(
    `UPDATE review_comments SET posted = TRUE, gitlab_note_id = $1, updated_at = NOW() WHERE id = $2`,
    [gitlabNoteId, commentId]
  );
}
