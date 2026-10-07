export function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    db: Number(url.pathname.slice(1) || 0),
    username: url.username || undefined,
    password: url.password || undefined,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}
