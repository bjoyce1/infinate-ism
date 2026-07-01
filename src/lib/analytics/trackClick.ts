import { supabase } from "@/integrations/supabase/client";

export type LinkType = "external_link" | "mailto" | "http";

export function detectLinkType(url: string): LinkType {
  if (/^mailto:/i.test(url)) return "mailto";
  if (/^https?:\/\//i.test(url)) return "external_link";
  return "http";
}

export interface TrackClickInput {
  url: string;
  nodeId: string;
  nodeLabel?: string | null;
  nodeCategory?: string | null;
  linkType?: LinkType;
}

export function trackLinkClick(input: TrackClickInput): void {
  try {
    const linkType = input.linkType ?? detectLinkType(input.url);
    const referrer =
      typeof window !== "undefined" ? window.location.href : null;
    // Fire-and-forget; never block navigation.
    void supabase
      .from("link_clicks")
      .insert({
        node_id: input.nodeId,
        node_label: input.nodeLabel ?? null,
        node_category: input.nodeCategory ?? null,
        link_type: linkType,
        url: input.url,
        referrer,
      })
      .then(({ error }) => {
        if (error) console.warn("[trackLinkClick]", error.message);
      });
  } catch (err) {
    console.warn("[trackLinkClick] failed", err);
  }
}