import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Robust logo scraper
//
// Strategy:
//   1. Fetch the target page HTML with retries + exponential backoff.
//   2. Parse the HTML for candidate logo URLs in a priority order:
//        og:image / twitter:image  →  JSON-LD `logo`  →  <link rel=icon>
//        (highest sizes first)     →  <link rel=apple-touch-icon>
//        →  <img> tags whose alt/class/id/src suggest "logo"
//   3. Resolve each candidate to an absolute URL, then verify it actually
//      returns a 2xx image response (HEAD, falling back to a ranged GET).
//   4. If nothing verifies, fall through a series of well-known fallbacks:
//        /favicon.ico, /apple-touch-icon.png,
//        Google's s2 favicon service, DuckDuckGo icon service.
//
// Every network call goes through `fetchWithRetry`, which retries on
// transient failures (network error, 408, 425, 429, 5xx) using exponential
// backoff with jitter and honours `Retry-After` when present.
// ---------------------------------------------------------------------------

type Attempt = { url: string; source: string; ok: boolean; status?: number; reason?: string };

const UA =
  "Mozilla/5.0 (compatible; MnemosyneScraper/1.0; +https://infinite-ism.lovable.app)";

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit & { retries?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const retries = init.retries ?? 3;
  const timeoutMs = init.timeoutMs ?? 12_000;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "user-agent": UA,
          accept: "*/*",
          ...(init.headers ?? {}),
        },
      });
      clearTimeout(timer);
      if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt === retries) {
        return res;
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      const backoff =
        (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 400 * 2 ** attempt) +
        Math.floor(Math.random() * 200);
      await sleep(Math.min(backoff, 8_000));
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt === retries) throw err;
      await sleep(400 * 2 ** attempt + Math.floor(Math.random() * 200));
    }
  }
  throw lastErr ?? new Error(`fetch failed: ${url}`);
}

function absoluteUrl(candidate: string, base: string): string | null {
  try {
    return new URL(candidate, base).toString();
  } catch {
    return null;
  }
}

function attr(html: string, tag: string, name: string): string | null {
  // extract <tag ... name="..." ...>; case-insensitive-ish
  const re = new RegExp(
    `<${tag}[^>]*\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  );
  const m = re.exec(html);
  return m ? (m[1] ?? m[2] ?? m[3] ?? null) : null;
}

function pickMeta(html: string, key: string): string | null {
  // <meta property|name="key" content="...">, either order
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]*content\\s*=\\s*["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*(?:property|name)\\s*=\\s*["']${key}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) return m[1];
  }
  return null;
}

type IconLink = { href: string; sizes: number; rel: string };

function collectIconLinks(html: string): IconLink[] {
  const out: IconLink[] = [];
  const linkRe = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const tag = m[0];
    const rel = attr(tag, "link", "rel")?.toLowerCase() ?? "";
    if (
      !rel.includes("icon") &&
      rel !== "apple-touch-icon" &&
      rel !== "apple-touch-icon-precomposed" &&
      rel !== "mask-icon" &&
      rel !== "fluid-icon"
    ) {
      continue;
    }
    const href = attr(tag, "link", "href");
    if (!href) continue;
    const sizesAttr = attr(tag, "link", "sizes") ?? "";
    // parse "192x192" — take the max dim; "any" → treat as 512
    const parts = sizesAttr.toLowerCase().split(/\s+/).filter(Boolean);
    let best = 0;
    for (const p of parts) {
      if (p === "any") best = Math.max(best, 512);
      const dim = /^(\d+)x(\d+)$/.exec(p);
      if (dim) best = Math.max(best, Number(dim[1]));
    }
    if (!best) best = rel.includes("apple") ? 180 : 32;
    out.push({ href, sizes: best, rel });
  }
  return out.sort((a, b) => b.sizes - a.sizes);
}

function collectLogoImages(html: string): string[] {
  const out: string[] = [];
  const imgRe = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html))) {
    const tag = m[0];
    const src = attr(tag, "img", "src") ?? attr(tag, "img", "data-src");
    if (!src) continue;
    const alt = (attr(tag, "img", "alt") ?? "").toLowerCase();
    const cls = (attr(tag, "img", "class") ?? "").toLowerCase();
    const id = (attr(tag, "img", "id") ?? "").toLowerCase();
    const hay = `${alt} ${cls} ${id} ${src.toLowerCase()}`;
    if (/\blogo\b|brand|wordmark|site-icon/.test(hay)) out.push(src);
  }
  return out;
}

function collectJsonLdLogo(html: string): string[] {
  const out: string[] = [];
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const walk = (v: unknown) => {
        if (!v) return;
        if (Array.isArray(v)) return v.forEach(walk);
        if (typeof v === "object") {
          const rec = v as Record<string, unknown>;
          const logo = rec.logo;
          if (typeof logo === "string") out.push(logo);
          else if (logo && typeof logo === "object" && typeof (logo as Record<string, unknown>).url === "string") {
            out.push((logo as Record<string, string>).url);
          }
          for (const val of Object.values(rec)) walk(val);
        }
      };
      walk(parsed);
    } catch {
      /* ignore malformed json-ld */
    }
  }
  return out;
}

async function verifyImage(url: string): Promise<{ ok: boolean; status?: number; reason?: string }> {
  try {
    // HEAD first
    let res = await fetchWithRetry(url, { method: "HEAD", retries: 2, timeoutMs: 8_000 });
    if (res.status === 405 || res.status === 501) {
      res = await fetchWithRetry(url, {
        method: "GET",
        retries: 1,
        timeoutMs: 8_000,
        headers: { range: "bytes=0-2048" },
      });
    }
    if (!res.ok) return { ok: false, status: res.status, reason: `status ${res.status}` };
    const ct = res.headers.get("content-type") ?? "";
    if (!/^image\//i.test(ct) && !/\.(png|jpe?g|gif|webp|svg|ico|avif)(\?|$)/i.test(url)) {
      return { ok: false, status: res.status, reason: `bad content-type ${ct}` };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

type ScrapeResult = {
  url: string | null;
  source: string | null;
  title: string | null;
  description: string | null;
  candidates: Attempt[];
};

async function scrape(target: string): Promise<ScrapeResult> {
  const pageRes = await fetchWithRetry(target, {
    headers: { accept: "text/html,application/xhtml+xml" },
  });
  if (!pageRes.ok) {
    throw new Error(`Failed to fetch ${target}: ${pageRes.status}`);
  }
  const finalUrl = pageRes.url || target;
  const html = (await pageRes.text()).slice(0, 800_000);

  const title = pickMeta(html, "og:title") ?? /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1] ?? null;
  const description =
    pickMeta(html, "og:description") ?? pickMeta(html, "description") ?? null;

  // Build candidate list in priority order.
  const raw: { url: string; source: string }[] = [];
  const push = (u: string | null | undefined, source: string) => {
    if (!u) return;
    const abs = absoluteUrl(u, finalUrl);
    if (abs) raw.push({ url: abs, source });
  };

  // 1. JSON-LD logo (usually highest quality, canonical brand asset)
  for (const l of collectJsonLdLogo(html)) push(l, "json-ld");
  // 2. High-res icon links
  for (const l of collectIconLinks(html)) push(l.href, `link:${l.rel} ${l.sizes}px`);
  // 3. <img class/alt=logo>
  for (const l of collectLogoImages(html)) push(l, "img:logo");
  // 4. Social preview art (usually a hero/logo composite)
  push(pickMeta(html, "og:image"), "og:image");
  push(pickMeta(html, "og:image:secure_url"), "og:image");
  push(pickMeta(html, "twitter:image"), "twitter:image");

  // 5. Well-known fallbacks
  const origin = new URL(finalUrl).origin;
  push(`${origin}/apple-touch-icon.png`, "wellknown:apple-touch-icon");
  push(`${origin}/apple-touch-icon-precomposed.png`, "wellknown:apple-touch-precomposed");
  push(`${origin}/favicon.ico`, "wellknown:favicon.ico");

  // 6. External favicon services (last resort — always returns *something*)
  const host = new URL(finalUrl).host;
  push(`https://www.google.com/s2/favicons?domain=${host}&sz=256`, "service:google");
  push(`https://icons.duckduckgo.com/ip3/${host}.ico`, "service:duckduckgo");

  // Dedupe while preserving priority order.
  const seen = new Set<string>();
  const ordered = raw.filter(({ url }) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });

  const attempts: Attempt[] = [];
  let chosen: { url: string; source: string } | null = null;

  for (const cand of ordered) {
    const check = await verifyImage(cand.url);
    attempts.push({ url: cand.url, source: cand.source, ...check });
    if (check.ok) {
      chosen = cand;
      break;
    }
  }

  return {
    url: chosen?.url ?? null,
    source: chosen?.source ?? null,
    title,
    description,
    candidates: attempts,
  };
}

export const scrapeSiteLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ url: z.string().url().max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden — admin role required");
    return scrape(data.url);
  });

export const scrapeAndAssignLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        url: z.string().url().max(2000),
        node_id: z.string().min(1).max(512),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden — admin role required");

    const result = await scrape(data.url);
    if (!result.url) {
      return { ...result, assigned: false };
    }

    // Mirror the found image into the node-images bucket so we don't hotlink
    // (some sources block cross-origin, some rotate URLs). If mirroring fails,
    // still record the remote URL — the fallback services in particular are
    // safe to hotlink.
    let finalUrl = result.url;
    try {
      const imgRes = await fetchWithRetry(result.url, { retries: 2, timeoutMs: 15_000 });
      if (imgRes.ok) {
        const buf = new Uint8Array(await imgRes.arrayBuffer());
        const ct = imgRes.headers.get("content-type") ?? "image/png";
        const ext =
          /svg/i.test(ct) ? "svg" :
          /jpe?g/i.test(ct) ? "jpg" :
          /webp/i.test(ct) ? "webp" :
          /gif/i.test(ct) ? "gif" :
          /x-icon|vnd\.microsoft\.icon/i.test(ct) ? "ico" :
          "png";
        const path = `${data.node_id}/${Date.now()}.${ext}`;
        const up = await supabaseAdmin.storage
          .from("node-images")
          .upload(path, buf, { upsert: true, contentType: ct });
        if (!up.error) {
          const { data: pub } = supabaseAdmin.storage.from("node-images").getPublicUrl(path);
          finalUrl = pub.publicUrl;
        }
      }
    } catch {
      /* keep remote URL */
    }

    const { error } = await supabaseAdmin
      .from("node_image_overrides")
      .upsert({ node_id: data.node_id, image_url: finalUrl, updated_by: context.userId });
    if (error) throw new Error(error.message);

    return { ...result, url: finalUrl, assigned: true };
  });