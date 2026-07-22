import app from "./app";
import { logger } from "./lib/logger";
import { setupWebSocketServer } from "./ws/server";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = app.listen(port, () => {
  logger.info({ port }, "Server listening");
});

// Attach the WebSocket server to the same HTTP server
setupWebSocketServer(httpServer);
