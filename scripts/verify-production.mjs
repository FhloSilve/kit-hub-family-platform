const baseURL = (
  process.env.KIT_HUB_PRODUCTION_URL ??
  "https://kit-hub-family-platform.scarletsilverfox.workers.dev"
).replace(/\/$/, "");
const expectedReleaseId = process.env.EXPECTED_RELEASE_ID?.trim() || null;

async function fetchJSON(path) {
  const response = await fetch(`${baseURL}${path}`, { cache: "no-store" });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${path} returned non-JSON content (${response.status}): ${text.slice(0, 300)}`);
  }
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

async function verify() {
  const [health, ready] = await Promise.all([fetchJSON("/api/health"), fetchJSON("/api/ready")]);
  if (health.status !== "ok" || ready.status !== "ready") {
    throw new Error(`Unexpected production state: ${JSON.stringify({ health, ready })}`);
  }
  if (typeof ready.version?.id !== "string" || ready.version.id.length === 0) {
    throw new Error(`Deployment metadata is missing: ${JSON.stringify(ready)}`);
  }

  let release = null;
  if (expectedReleaseId) {
    release = await fetchJSON("/api/release-state");
    if (release.releaseId !== expectedReleaseId) {
      throw new Error(`Expected release ${expectedReleaseId}, received ${release.releaseId ?? "none"}.`);
    }
  }

  console.log(JSON.stringify({
    verified: true,
    health: health.status,
    readiness: ready.status,
    workerVersion: ready.version.id,
    releaseId: release?.releaseId ?? null,
  }));
}

let lastError;
for (let attempt = 1; attempt <= 5; attempt += 1) {
  try {
    await verify();
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.error(`Production verification attempt ${attempt} failed:`, error);
    if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
  }
}

throw lastError;
