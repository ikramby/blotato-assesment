## Quick start

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL
npm run prisma:migrate
npm run dev
```

## Architecture

```
src/
  adapters/     # one class per social platform, all implementing SocialPlatformAdapter
  types/        # NormalizedComment and other cross-platform shared types
  services/     # CommentService — orchestrates cache + adapter calls, DB writes
  routes/       # Express REST handlers
  validation/   # Zod request schemas
  db/           # Prisma client singleton
prisma/
  schema.prisma # DB schema
docs/
  API_DESIGN.md # endpoint-level API spec
```

### Key design decisions

**Adapter Pattern for platform integration.** `SocialPlatformAdapter` is the single interface every
platform must implement (`getComments`, `replyToComment`). This is the decision the whole system is
built around: the prompt explicitly says the system already supports multiple platforms and will
support more — so the cost of adding platform N+1 should be "write one new adapter class," not
"touch the routes, the service, and the DB layer." `AdapterFactory` is the one place that knows
about every registered platform.

**Comments are cached locally, not proxied live.** `PlatformPost` and `Comment` are stored in our
own DB. Reads are served from cache (refreshed on a short TTL), writes (replies) go to the platform
first and only get persisted locally on success. I chose this over "always call the platform live"
because: read volume for a comments UI is much higher than write volume, platform APIs are
rate/quota-limited (YouTube's quota system in particular punishes chatty polling), and a local
cache lets us serve comments even during a platform outage. The trade-off is comments can be
briefly stale — acceptable for a scheduling dashboard, probably not for something like live
moderation.

**Cursor-based pagination, not offset.** Comment lists are append-heavy and can change between page
requests; offset pagination breaks (skips/dupes) under concurrent inserts, cursor pagination
(keyed on comment ID) doesn't. Each adapter also translates the platform's own pagination style
(YouTube's opaque `pageToken`, LinkedIn's offset) into our cursor internally, so callers of the
adapter interface never see that difference.

**Replies attach by internal `Comment.id`, not external platform ID.** `POST
/comments/:commentId/reply` takes our ID and resolves platform, external post ID, external comment
ID, and credentials server-side from the DB relations. This keeps the public API platform-agnostic
— a client never needs to know which platform a comment came from to reply to it.

**Nested replies via self-referential `parentId`.** A simple adjacency list rather than a
materialized path or nested-set model, since thread depth on social platforms is typically shallow
(1-2 levels) and the extra complexity of a hierarchical query model isn't justified here.

## Assumptions

Since the prompt intentionally leaves details open, here's what I assumed:

- **One comment thread per (platform, external post)** — a post published to both YouTube and
  LinkedIn has two entirely separate comment sets; there's no cross-platform "unified" comment
  thread, since that's not how any platform's actual comment system works.
- **Credentials/tokens already exist** via `SocialConnection` — token acquisition/refresh (OAuth
  flow) is out of scope; the system assumes a valid, non-expired `accessToken` is available. A
  production version would need a token-refresh interceptor in each adapter.
- **Replies are always public replies to the platform's own comment thread** — not private
  messages, not internal-only notes.
- **Only 2 platforms are implemented** (YouTube, LinkedIn) as mocked adapters, sufficient to prove
  the pattern generalizes; real API calls (OAuth, actual HTTP requests to each platform) are
  stubbed out since the prompt says the reasoning matters more than a working integration against
  live third-party APIs.
- **No real-time sync/webhooks** — comments are pulled on-demand with a TTL cache rather than kept
  continuously in sync, to keep the take-home scope bounded. I called this out explicitly in
  `CommentService` as the first thing I'd revisit for a production version.

## What I'd do differently for production

- Webhook-based sync where a platform supports it (e.g. Meta's webhooks), falling back to polling
  only where necessary, instead of TTL-based cache invalidation everywhere.
- A token-refresh interceptor shared across adapters instead of assuming valid tokens.
- Rate-limit-aware queuing per platform connection (a shared queue per `SocialConnection` so a
  burst of reply requests doesn't itself trigger the platform's rate limiter).
- Idempotency keys on the reply endpoint, since retrying a failed reply request risks double-posting
  to the actual platform (unlike a normal internal write, this one has an external side effect).

