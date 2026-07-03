import { defineMcp } from "@lovable.dev/mcp-js";
import searchGraph from "./tools/search-graph";
import getNode from "./tools/get-node";

export default defineMcp({
  name: "mnemosyne-mcp",
  title: "Mnemosyne Second Brain",
  version: "0.1.0",
  instructions:
    "Tools for exploring the Mnemosyne / Second Brain knowledge graph — the personal graph of websites, songs, artworks, chapters, and people around mrcap1.com. Use `search_graph` to find relevant nodes semantically, then `get_node` to read a specific node and its neighbors.",
  tools: [searchGraph, getNode],
});