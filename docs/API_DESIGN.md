# API Design

## `GET /api/v1/posts/:platformPostId/comments`

Retrieves comments for a published post on a specific platform.

**Path params**
- `platformPostId` — our internal `PlatformPost.id` (not the platform's own post ID). The client
  gets this from whatever endpoint lists a user's published posts.

**Query params**
- `cursor` (optional) — internal `Comment.id` to paginate after. Omit for the first page.
- `limit` (optional, default 20, max 100)

**Response `200`**
```json
{
  "comments": [
    {
      "id": "clx...",
      "externalCommentId": "yt_comment_abc_0",
      "authorName": "YouTube User 0",
      "content": "Great video!",
      "createdAtPlatform": "2026-09-08T10:00:00.000Z",
      "replies": [ ... ]
    }
  ],
  "nextCursor": "clx..." | null
}
```

Only top-level comments are paginated; each top-level comment's `replies` are returned inline
(unpaginated). Rationale: reply counts per comment are typically small (single/low-double digits)
on social platforms, so paginating replies separately would add API round-trips for little benefit.
If a future platform commonly has deeply-threaded/high-volume replies, this would need revisiting.

**Errors**
- `502` — platform API call failed (non-retryable), e.g. invalid/revoked token
- `503` — platform API call failed (retryable), e.g. rate limited
- `404` — unknown `platformPostId`

---

## `POST /api/v1/comments/:commentId/reply`

Replies to a comment (top-level or nested — the target is just whichever comment `:commentId`
refers to).

**Path params**
- `commentId` — our internal `Comment.id`

**Body**
```json
{ "content": "Thanks for watching!" }
```

**Response `201`** — the newly created reply, in our normalized `Comment` shape.

**Errors**
- `400` — validation failure (empty/too-long content)
- `502`/`503` — same as above, platform-specific failure

---

## Why these two endpoints and not more?

The take-home asks for "retrieve comments" and "reply to a comment" — I deliberately did not add
endpoints like `DELETE /comments/:id` or `PATCH` (edit) since they weren't requested and each
platform's support for edit/delete-via-API varies a lot (some platforms only allow deleting your
*own* comments, some don't expose delete at all). Scoping to the two required operations keeps
the adapter contract minimal and avoids designing for platform capabilities I'd just be guessing at.
