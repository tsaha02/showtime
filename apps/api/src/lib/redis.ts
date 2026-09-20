import Redis from "ioredis";
import { env } from "../config/env";

// Plain command client: seat locks (SET NX EX / DEL) and read-path caching.
export const redis = new Redis(env.redisUrl);

// Socket.io's Redis adapter needs two DEDICATED connections: once a
// connection issues SUBSCRIBE it can no longer run other commands, so the
// adapter requires a pub client and a sub client separate from `redis`
// above (which keeps doing normal GET/SET/DEL for seat locks).
export const pubClient = new Redis(env.redisUrl);
export const subClient = pubClient.duplicate();
