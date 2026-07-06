import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UA = "Mozilla/5.0 (compatible; MnemosyneResync/1.0; +https://infinite-ism.lovable.app)";
const TARGET = "https://www.ogpointblank.com";
const NODE_ID = "spc_artist_point_blank";

type Link = { href: string; text: string };
type Report = {
  fetched_at: string;
  source_url: string;
  final_url: string;
  status: number;
  title: string | null;
  description: string | null;
  og_image: string | null;
  logo_url: string | null;
  links: Link[];
  emails: string[];
  socials: Link[];
  logo_assigned: boolean;
};

function pickMeta(html: string, key: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]*content\\s*=\\s*["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*(?:property|name)\\s*=\\s*["']${key}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) return m[1];
  }
  return null;
}

function abs(href: string, base: string): string | null {
  try { return new URL(href, base).toString(); } catch { return null; }
}

export const resyncPointBlank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Report> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden — admin role required");

    const res = await fetch(TARGET, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
    });
    const finalUrl = res.url || TARGET;
    const html = (await res.text()).slice(0, 800_000);

    const title = pickMeta(html, "og:title") ?? /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1]?.trim() ?? null;
    const description = pickMeta(html, "og:description") ?? pickMeta(html, "description");
    const ogImage = pickMeta(html, "og:image") ?? pickMeta(html, "twitter:image");

    // links
    const linkMap = new Map<string, string>();
    const aRe = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = aRe.exec(html))) {
      const u = abs(m[1], finalUrl);
      if (!u) continue;
      const text = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
      if (!linkMap.has(u)) linkMap.set(u, text);
    }
    const links: Link[] = [...linkMap.entries()].map(([href, text]) => ({ href, text }));

    const emails = Array.from(
      new Set((html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).map((e) => e.toLowerCase())),
    );

    const socialRe = /(instagram\.com|twitter\.com|x\.com|facebook\.com|youtube\.com|youtu\.be|tiktok\.com|soundcloud\.com|spotify\.com|apple\.com\/music|bandcamp\.com|linktr\.ee)/i;
    const socials = links.filter((l) => socialRe.test(l.href));

    // logo: prefer og:image, then link[rel*=icon]
    let logoUrl: string | null = ogImage ? abs(ogImage, finalUrl) : null;
    if (!logoUrl) {
      const iconMatch = /<link[^>]+rel\s*=\s*["'][^"']*icon[^"']*["'][^>]*href\s*=\s*["']([^"']+)["']/i.exec(html)
        ?? /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["'][^"']*icon[^"']*["']/i.exec(html);
      if (iconMatch) logoUrl = abs(iconMatch[1], finalUrl);
    }

    // Mirror logo into bucket + update image override
    let assigned = false;
    if (logoUrl) {
      try {
        const imgRes = await fetch(logoUrl, { headers: { "user-agent": UA } });
        if (imgRes.ok) {
          const buf = new Uint8Array(await imgRes.arrayBuffer());
          const ct = imgRes.headers.get("content-type") ?? "image/png";
          const ext = /svg/i.test(ct) ? "svg" : /jpe?g/i.test(ct) ? "jpg" : /webp/i.test(ct) ? "webp" : /gif/i.test(ct) ? "gif" : "png";
          const path = `${NODE_ID}/${Date.now()}.${ext}`;
          const up = await supabaseAdmin.storage.from("node-images").upload(path, buf, { upsert: true, contentType: ct });
          if (!up.error) {
            const { data: pub } = supabaseAdmin.storage.from("node-images").getPublicUrl(path);
            const finalLogo = pub.publicUrl;
            const { error } = await supabaseAdmin
              .from("node_image_overrides")
              .upsert({ node_id: NODE_ID, image_url: finalLogo, updated_by: context.userId });
            if (!error) {
              assigned = true;
              logoUrl = finalLogo;
            }
          }
        }
      } catch { /* keep remote */ }
    }

    return {
      fetched_at: new Date().toISOString(),
      source_url: TARGET,
      final_url: finalUrl,
      status: res.status,
      title,
      description,
      og_image: ogImage,
      logo_url: logoUrl,
      links,
      emails,
      socials,
      logo_assigned: assigned,
    };
  });
