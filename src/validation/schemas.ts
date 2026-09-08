import { z } from "zod";

export const getCommentsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const replyToCommentBodySchema = z.object({
  content: z.string().trim().min(1, "content cannot be empty").max(5000, "content too long"),
});
