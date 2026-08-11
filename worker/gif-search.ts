import { Hono } from "hono";
import type { AppBindings } from "./http";
import { apiError } from "./http";

const app = new Hono<AppBindings>();
type Ctx = Parameters<typeof apiError>[0];

function key(c: Ctx) {
  return (c.env as unknown as { GIPHY_API_KEY?: string }).GIPHY_API_KEY?.trim() || "";
}

function providerMessage(status: number) {
  if (status === 401 || status === 403) return "GIPHY detected the key, but rejected it. Check that the key is active and belongs to the correct GIPHY app.";
  if (status === 429) return "GIPHY is rate-limiting GIF search right now. Try again in a little while.";
  if (status >= 500) return "GIPHY is temporarily unavailable. Try again shortly.";
  return `GIPHY returned HTTP ${status}.`;
}

async function giphy(url: string) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => null) as any;
  return { response, body };
}

app.get("/api/v1/media/gifs/status", async c => {
  const apiKey = key(c);
  if (!apiKey) return c.json({ configured: false, available: false, provider: "GIPHY", message: "GIPHY_API_KEY is not visible to the deployed Worker." }, 200, { "cache-control": "no-store" });
  try {
    const endpoint = `https://api.giphy.com/v1/gifs/trending?api_key=${encodeURIComponent(apiKey)}&limit=1&rating=g`;
    const { response } = await giphy(endpoint);
    return c.json({ configured: true, available: response.ok, provider: "GIPHY", providerStatus: response.status, message: response.ok ? "GIPHY search is ready." : providerMessage(response.status) }, 200, { "cache-control": "no-store" });
  } catch {
    return c.json({ configured: true, available: false, provider: "GIPHY", message: "The Worker can see the GIPHY key, but could not reach GIPHY." }, 200, { "cache-control": "no-store" });
  }
});

app.get("/api/v1/media/gifs/search", async c => {
  const query = (c.req.query("q") || "").trim().slice(0, 80);
  if (!query) return c.json({ items: [] });
  const apiKey = key(c);
  if (!apiKey) return apiError(c, 422, "gif_search_not_configured", "The deployed Worker cannot see GIPHY_API_KEY yet. Re-save the secret on the production Worker and deploy once more.");
  try {
    const endpoint = `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&limit=18&offset=0&rating=g&lang=en`;
    const { response, body } = await giphy(endpoint);
    if (!response.ok) return apiError(c, response.status === 429 ? 409 : 422, "gif_provider_rejected", providerMessage(response.status));
    const data = Array.isArray(body?.data) ? body.data : [];
    const items = data.flatMap((item: any) => {
      const original = item?.images?.original?.url;
      const fixed = item?.images?.fixed_width?.url;
      const preview = item?.images?.fixed_width_small?.url || item?.images?.fixed_width?.url || original;
      const url = original || fixed;
      return url && preview ? [{ id: String(item.id), url: String(url), previewUrl: String(preview), title: String(item.title || "GIF") }] : [];
    });
    return c.json({ items, provider: "GIPHY" }, 200, { "cache-control": "no-store" });
  } catch {
    return apiError(c, 500, "gif_search_failed", "The Worker could not reach GIPHY. You can still paste a direct GIF link.");
  }
});

export default app;
