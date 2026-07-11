import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchGraph from "./tools/search-graph";
import getNode from "./tools/get-node";
import brainCapture from "./tools/brain-capture";
import brainQuery from "./tools/brain-query";
import brainGetPage from "./tools/brain-get-page";
import brainUpdatePage from "./tools/brain-update-page";

// Use the direct Supabase issuer, not the .lovable.cloud proxy: mcp-js
// verifies discovery and rejects a proxy URL whose issuer doesn't match.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "mnemosyne-mcp",
  title: "Mnemosyne Second Brain",
  version: "0.1.0",
  instructions:
    "Tools for exploring the Mnemosyne / C.A.P.I.S.M. Second Brain. Use `search_graph` + `get_node` to browse the public knowledge graph, and `brain_capture` / `brain_query` / `brain_get_page` / `brain_update_page` to read and write the authenticated user's Second Brain pages.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchGraph, getNode, brainCapture, brainQuery, brainGetPage, brainUpdatePage],
});