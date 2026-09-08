import { Router, Request, Response, NextFunction } from "express";
import { commentService } from "../services/CommentService";
import { getCommentsQuerySchema, replyToCommentBodySchema } from "../validation/schemas";
import { PlatformApiError } from "../types/comment";

export const commentsRouter = Router();

/**
 * GET /api/v1/posts/:platformPostId/comments
 * Cursor-based pagination (not offset) because comment sets are append-heavy
 * and grow while a user is paginating — offset pagination would skip/duplicate
 * items under concurrent writes. Cursor = last seen comment ID.
 */
commentsRouter.get("/posts/:platformPostId/comments", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { platformPostId } = req.params;
    const query = getCommentsQuerySchema.parse(req.query);

    const result = await commentService.getComments(platformPostId, query.cursor, query.limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/comments/:commentId/reply
 * Replies to whichever comment :commentId refers to (top-level or nested) —
 * the platform, external IDs, and credentials are all resolved server-side
 * from the stored Comment/PlatformPost/SocialConnection chain, so callers
 * only ever need our internal comment ID.
 */
commentsRouter.post("/comments/:commentId/reply", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { commentId } = req.params;
    const { content } = replyToCommentBodySchema.parse(req.body);

    const reply = await commentService.replyToComment(commentId, content);
    res.status(201).json(reply);
  } catch (err) {
    next(err);
  }
});

// Centralized error mapping — keeps route handlers free of try/catch boilerplate
// for the "what HTTP status does this error deserve" question.
export function commentsErrorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof PlatformApiError) {
    return res.status(err.retryable ? 503 : 502).json({ error: err.message, retryable: err.retryable });
  }
  if (err && typeof err === "object" && "issues" in err) {
    // zod validation error
    return res.status(400).json({ error: "validation_failed", details: (err as any).issues });
  }
  console.error(err);
  return res.status(500).json({ error: "internal_server_error" });
}
