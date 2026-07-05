
## 1. Rename JARVIS → C.A.P.I.S.M.

In `src/components/graph/BootGreeting.tsx`, update the greeting line to introduce the assistant as **C.A.P.I.S.M.** (Cognitive Adaptive Processing & Intelligent Systems Matrix). New line: `"C.A.P.I.S.M. online — {count} nodes indexed, every star accounted for."` Keep the same toast + TTS behavior.

## 2. New `CapismPanel` drawer

Create `src/components/graph/CapismPanel.tsx`, mounted from `TopBar.tsx` beside the SPC Artists drawer as a **right-side Sheet** (reusing `@/components/ui/sheet`). Trigger button: `◈ C.A.P.I.S.M.` styled like the other TopBar chips, with a subtle cyan pulse dot when open.

### Layout (single scrollable column, HUD-styled)

Dark obsidian surface + neon cyan/magenta/red accents matching the reference. Sections:

1. **Header strip** — "C.A.P.I.S.M." title, subtitle "COGNITIVE ADAPTIVE PROCESSING & INTELLIGENT SYSTEMS MATRIX", live clock (updates every second), build id derived from graph node count.
2. **Top stat row** (4 mini cards, animated sparklines):
   - `CORE TEMP` — derived from average node degree (mapped to °C)
   - `NEURAL LOAD` — % of nodes currently in the active filter set
   - `SYSTEM UPTIME` — time since page mount
   - `SECURITY LEVEL` — ALPHA when signed in, BETA when anonymous
3. **Core Sync Ring** — SVG concentric rings, slowly rotating (CSS `@keyframes spin` at 40s/60s counter-rotating), center label "C.A.P.I.S.M. — CENTRAL AI PROCESSING INTERFACE — ONLINE". Ring fill % = share of nodes with images (from `node_image_overrides` if already loaded, otherwise `node.image` presence). Left gauge (0–100) = focus/selected community coverage; right gauge = filter efficiency.
4. **System Status bars** — animated progress bars (Radix `Progress`):
   - CPU = code node share, MEMORY = blog share, GPU = image share, NETWORK = link density, STORAGE = capture count / max, POWER = 100% pulsing.
5. **AI Models** — top 4 communities by size, each row shows community name, node count as %, colored bar. Click a row → `setCommunity(id)` in graph store.
6. **Notifications** — most recent captures (from `useGraphStore.captures`, newest 4) with relative timestamps.
7. **Real-time Analytics** — small SVG multi-line chart (4 colored lines) showing rolling category counts over the last 60s, updated each second by sampling filtered graph state.

### Animation

- CSS keyframes: `hud-pulse`, `hud-scan` (top→bottom sweep on ring), `hud-spin-slow`, `hud-spin-reverse`, `hud-flicker` (subtle on numbers).
- All numbers animate via a small `useCountUp` hook.
- Sparklines drawn as SVG `polyline` with `stroke-dasharray` draw-in on mount.
- Respect `prefers-reduced-motion` — freeze rotations and sweeps.

### Data wiring

New hook `useCapismMetrics(graph)` in the same file that computes derived metrics from `NormalizedGraph`, `useGraphStore` (activeCategories, activeCommunity, selectedId, captures), and `supabase.auth.getSession()` for the security level. Ticks every 1s via `setInterval` to advance uptime, clock, sparkline buffers.

### Interactions

- Clicking a community row jumps and highlights that community.
- Clicking a notification calls `select(id) + pulseNode(id) + setRightPanel(true)`.
- "VIEW ALL ALERTS" opens the existing `CapturesDrawer` (dispatch a custom event it listens for, or lift open state).

## 3. TopBar wiring

Add `<CapismPanel graph={graph} />` next to `<SpcArtistsDrawer />` in `TopBar.tsx`. Guard on `graph` prop (already optional).

## Files

- edit `src/components/graph/BootGreeting.tsx`
- create `src/components/graph/CapismPanel.tsx`
- edit `src/components/graph/TopBar.tsx`

No backend, schema, or route changes.
