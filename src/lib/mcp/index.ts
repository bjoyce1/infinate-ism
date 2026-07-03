import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchGraph from "./tools/search-graph";
import getNode from "./tools/get-node";

// Use the direct Supabase issuer, not the .lovable.cloud proxy: mcp-js
// verifies discovery and rejects a proxy URL whose issuer doesn't match.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "mnemosyne-mcp",
  title: "Mnemosyne Second Brain",
  version: "0.1.0",
  instructions:
    "Tools for exploring the Mnemosyne / Second Brain knowledge graph — the personal graph of websites, songs, artworks, chapters, and people around mrcap1.com. Use `search_graph` to find relevant nodes semantically, then `get_node` to read a specific node and its neighbors.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchGraph, getNode],
});