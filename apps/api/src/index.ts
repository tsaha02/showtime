import { createServer } from "http";
import { createApp } from "./app";
import { initSocket, io } from "./lib/socket";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { redis, pubClient, subClient } from "./lib/redis";

const app = createApp();
const server = createServer(app);
initSocket(server);

server.listen(env.port, () => {
  console.log(`ShowTime API listening on http://localhost:${env.port}`);
  // Printed at boot specifically because dotenv only reads apps/api/.env
  // once, at process startup — editing .env while `tsx watch` is already
  // running does NOT take effect until the process is restarted (.env
  // isn't part of the module graph tsx watches for changes). These lines
  // are the fastest way to confirm a freshly-added key actually got
  // picked up, without needing to hit the feature first to find out.
  console.log(
    env.omdbApiKey
      ? "OMDb integration: configured"
      : "OMDb integration: not configured (set OMDB_API_KEY in apps/api/.env and restart to enable admin's 'Import movie')",
  );
  console.log(
    env.resendApiKey
      ? "Email delivery (Resend): configured"
      : "Email delivery (Resend): not configured — OTP codes and ticket emails will be logged to this console instead of sent (set RESEND_API_KEY in apps/api/.env and restart to send real emails)",
  );
  console.log(
    env.stripeSecretKey
      ? "Payments (Stripe test mode): configured"
      : "Payments (Stripe test mode): not configured — checkout will use the mocked payment fallback (set STRIPE_SECRET_KEY in apps/api/.env and restart for real test-mode payments)",
  );
});

// Closes every long-lived connection this process holds before exiting,
// instead of leaving the OS to tear them down abruptly — matters most
// for Postgres/Redis, which otherwise have to notice a dropped
// connection via a timeout rather than a clean disconnect, and for
// in-flight HTTP requests, which `server.close()` lets finish instead of
// cutting off mid-response. Registered for both SIGTERM (how a process
// manager like Docker/Render/Railway asks a service to stop) and SIGINT
// (Ctrl+C in a terminal) — the two signals a local dev workflow and a
// real deployment actually send.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received — shutting down gracefully...`);

  io?.close();
  server.close();

  await Promise.allSettled([prisma.$disconnect(), redis.quit(), pubClient.quit(), subClient.quit()]);

  console.log("Shutdown complete.");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
