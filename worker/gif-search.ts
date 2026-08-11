import { Hono } from "hono";
import type { AppBindings } from "./http";
import { apiError } from "./http";
import { createAuth } from "./auth";

const app = new Hono<AppBindings>();
type Ctx = Parameters<typeof apiError>[0];

function normalizeSecret(value:string|undefined){
  let next=(value||"").trim();
  if(/^GIPHY_API_KEY\s*=/.test(next))next=next.replace(/^GIPHY_API_KEY\s*=\s*/,"").trim();
  if((next.startsWith('"')&&next.endsWith('"'))||(next.startsWith("'")&&next.endsWith("'")))next=next.slice(1,-1).trim();
  return next;
}
function key(c: Ctx) { return normalizeSecret((c.env as unknown as { GIPHY_API_KEY?: string }).GIPHY_API_KEY); }
function providerDetail(body:any){return String(body?.meta?.msg||body?.message||body?.error?.message||"").trim().slice(0,220)}
function providerMessage(status: number,body?:any) {
  const detail=providerDetail(body);
  if (status === 401 || status === 403) return detail?`GIPHY rejected the configured key: ${detail}`:"GIPHY detected the key, but rejected it. Confirm the key is an active GIPHY API key for this app, not a copied label or disabled credential.";
  if (status === 429) return "GIPHY is rate-limiting GIF search right now. Try again in a little while.";
  if (status >= 500) return "GIPHY is temporarily unavailable. Try again shortly.";
  return detail?`GIPHY returned HTTP ${status}: ${detail}`:`GIPHY returned HTTP ${status}.`;
}

async function giphy(url: string) {
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent":"KitHubFamilyPlatform/1.0" } });
  const body = await response.json().catch(() => null) as any;
  return { response, body };
}

app.get("/api/v1/media/gifs/sdk-config", async c => {
  const session=await createAuth(c.env,c.req.raw).api.getSession({headers:c.req.raw.headers});
  if(!session?.user)return apiError(c,401,"AUTH_REQUIRED","Sign in to use GIF search.");
  const apiKey=key(c);
  if(!apiKey)return apiError(c,422,"gif_sdk_not_configured","The deployed Worker cannot see GIPHY_API_KEY yet.");
  return c.json({provider:"GIPHY",mode:"web-sdk",apiKey},200,{"cache-control":"no-store, private"});
});

app.get("/api/v1/media/gifs/status", async c => {
  const apiKey = key(c);
  if (!apiKey) return c.json({ configured: false, available: false, provider: "GIPHY", message: "GIPHY_API_KEY is not visible to the deployed Worker." }, 200, { "cache-control": "no-store" });
  try {
    const endpoint = `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent("family")}&limit=1&offset=0&rating=g&lang=en`;
    const { response,body } = await giphy(endpoint);
    return c.json({ configured: true, available: response.ok, provider: "GIPHY", providerStatus: response.status, message: response.ok ? "GIPHY search is ready." : providerMessage(response.status,body) }, 200, { "cache-control": "no-store" });
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
    if (!response.ok) return apiError(c, response.status === 429 ? 409 : 422, "gif_provider_rejected", providerMessage(response.status,body));
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
