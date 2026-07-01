import { createFileRoute, Navigate } from "@tanstack/react-router";
import acOg from "@/assets/ac-og.jpg.asset.json";

const SITE = "https://infinate-ism.lovable.app";
const OG_IMAGE = `${SITE}${acOg.url}`;
const TITLE = "AbSoulutely CAPtivating · Creative System — Mnemosyne";
const DESC =
  "Explore the AbSoulutely CAPtivating creative system inside Mnemosyne: roles, tools, the Define → Translate → Build → Launch flow, and every connection back to the mrcap1.com hub.";

export const Route = createFileRoute("/absoulutelycaptivating")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "article" },
      { property: "og:url", content: `${SITE}/absoulutelycaptivating` },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: "1216" },
      { property: "og:image:height", content: "640" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESC },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [{ rel: "canonical", href: `${SITE}/absoulutelycaptivating` }],
  }),
  component: RedirectToGraph,
});

function RedirectToGraph() {
  return (
    <Navigate
      to="/"
      search={{ view: "2d", node: "site_absoulutelycaptivating_com", focus: true }}
      replace
    />
  );
}