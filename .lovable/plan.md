# Second Brain — Graph Explorer

A single-page, dark-mode explorer for the knowledge graph in your uploaded `graph.json`. No login, no backend — the graph ships as a static asset and runs entirely in the browser.

## What you get

- **Full-screen interactive graph** (2D force-directed) as the home page
  - Nodes colored by `file_type` (code / blog / music / image / other)
  - Sized by degree (more connections = bigger star)
  - Pan, zoom, drag nodes
  - Hover: highlight neighbors, dim the rest
  - Click: opens right detail panel + soft focus on that node
- **Left sidebar** — Communities & filters
  - "Communities" list, generated from `community` field in graph.json, sorted by size, with counts. Click to filter graph to that cluster.
  - "Filter by Type" toggle chips (.Code / .Blog / .Audio / .Visual)
  - Bottom status card: "Exploring N nodes across M clusters" / "Focus mode: <label>"
- **Top overlay**
  - Command-K style search pill (fuzzy over node labels)
  - "2D VIEW" indicator (3D deferred — see Non-goals)
  - "FOCUS MODE" toggle: isolates selected node's 1-hop neighborhood
- **Right detail panel** (slides in on select)
  - Node label, file_type badge, community
  - `source_file` and `source_location`
  - Direct neighbors list (clickable → selects that node)
  - Metadata grid (origin, community, id)
  - "Open Source File" (copies the source path — no filesystem access from the browser)
- **Empty state** before selection: brief hint text

## Data

- Copy `graph.json` from your zip into `public/graph.json` so it's served as a static asset (fetched once on load, cached).
- Parse into `{ nodes, links }`. Precompute per-node degree, neighbor sets, and community rollups.
- Everything downstream (search index, filters, focus) runs in memory.

## Tech details

- Route: single `src/routes/index.tsx` (home is the explorer).
- Graph rendering: `react-force-graph-2d` (WebGL/canvas, handles thousands of nodes smoothly). Install via bun.
- Search: `fuse.js` for fuzzy label search.
- State: local component state + a small `useGraphStore` (zustand) for selection / filters / focus.
- Styling: adopt the "Obsidian precision" tokens verbatim into `src/styles.css` under `@theme` (obsidian-bg #0A0A0B, obsidian-surface #161618, obsidian-border #262629, neon-primary #3DED97). Load Sora + IBM Plex Mono via `<link>` in `__root.tsx` head.
- File structure:
  ```
  src/
    routes/index.tsx          (layout: sidebar + canvas + detail panel)
    components/graph/
      GraphCanvas.tsx         (react-force-graph wrapper)
      LeftSidebar.tsx
      DetailPanel.tsx
      TopBar.tsx              (search + focus toggle)
      SearchCommand.tsx       (Cmd+K palette)
    lib/graph/
      loadGraph.ts            (fetch + normalize graph.json)
      useGraphStore.ts        (zustand: selection, filters, focus)
      types.ts
  public/graph.json
  ```

## Non-goals for v1

- 3D view (the button will be present but disabled with a "coming soon" tooltip — 3D adds a heavy dep and a different renderer). Say the word if you want it in v1.
- Editing / adding notes (you chose read-only).
- Auth / persistence.
- Node thumbnails from your `thumbnails/` folder — can wire up next pass if you want image previews inside the detail panel.

## Follow-up options (not in this build unless you say so)

- Wire the `thumbnails/` folder into the detail panel for image-type nodes.
- Add the 3D view with `react-force-graph-3d`.
- Import your `GRAPH_REPORT.md` as an "About this graph" modal.
