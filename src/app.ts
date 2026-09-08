import express from "express";
import { commentsRouter, commentsErrorHandler } from "./routes/comments";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.use("/api/v1", commentsRouter);

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use(commentsErrorHandler);
  return app;
}

if (require.main === module) {
  const app = createApp();
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Blotato comments API listening on :${port}`));
}
