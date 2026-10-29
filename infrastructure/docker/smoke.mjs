import process from "node:process";
import console from "node:console";
// Read-only smoke suite. Credentials come from the staging secret store, never arguments/logs.
const api = process.env.SMOKE_API_URL,
  web = process.env.SMOKE_WEB_URL;
if (
  !api ||
  !web ||
  !process.env.SMOKE_TENANT ||
  !process.env.SMOKE_EMAIL ||
  !process.env.SMOKE_PASSWORD
)
  throw Error("Smoke environment incomplete");
async function check(url, init) {
  const response = await globalThis.fetch(url, {
    ...init,
    signal: globalThis.AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error(`Smoke HTTP ${response.status}`);
  return response;
}
await check(`${api}/health/live`);
await check(`${api}/health/ready`);
await check(`${web}/login`);
const login = await check(`${api}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: web },
  body: JSON.stringify({
    tenantSlug: process.env.SMOKE_TENANT,
    email: process.env.SMOKE_EMAIL,
    password: process.env.SMOKE_PASSWORD,
  }),
});
const cookie = login.headers
  .getSetCookie()
  .map((x) => x.split(";")[0])
  .join("; ");
try {
  for (const route of ["/auth/me", "/dashboard/worklist", "/projects"])
    await check(`${api}/api/v1${route}`, { headers: { Cookie: cookie } });
  if (process.env.SMOKE_PROJECT_ID)
    await check(
      `${api}/api/v1/projects/${encodeURIComponent(process.env.SMOKE_PROJECT_ID)}`,
      { headers: { Cookie: cookie } },
    );
  console.info(
    JSON.stringify({
      event: "staging_smoke_passed",
      checks: ["live", "ready", "login", "dashboard", "projects"],
    }),
  );
} finally {
  await check(`${api}/api/v1/auth/logout`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: web },
  });
}
