## Goal

Turn Mnemosyne into an AI-aware second brain backed by Lovable Cloud. Four capabilities, one cohesive UX.

## 1. AI Chat with your graph

- New right-panel tab **Ask** next to the existing detail view (toggle in `DetailPanel.tsx`).
- Uses `useChat` → `POST /api/chat` (TanStack server route).
- Server route injects graph context: top-K semantically relevant nodes for the user's question (via embeddings, below), plus the currently selected node.
- Streams answers with `google/gemini-3-flash-preview` through the Lovable AI Gateway.
- Answers cite nodes as `[[node_id]]`; the UI turns them into clickable chips that select the node in the graph.

## 2. AI auto-tagging & summaries

- **Summarize / Suggest tags** buttons in `DetailPanel` for the selected node.
- Server fn `summarizeNode({ id })` uses `generateText` + structured output (`{ summary, tags[] }`).
- Result saved to Cloud (`node_notes` table) so it persists and shows on reload.

## 3. Semantic search

- Cloud table `node_embeddings (node_id text pk, embedding vector(1536), text_hash text, updated_at)`.
- One-time server fn `rebuildEmbeddings()` (admin-gated) walks `graph.json`, embeds `label + snippet` with `openai/text-embedding-3-small`, upserts.
- Search palette gets a **Semantic** toggle: server fn `semanticSearch({ q, limit })` embeds the query and returns top matches via `match_nodes()` SQL function. Falls back to Fuse when off.

## 4. Cloud-persisted notes/tags

- Table `node_notes (node_id text pk, user_id uuid, summary text, tags text[], note text, updated_at)`.
- RLS: user reads/writes only their own rows.
- Detail panel shows editable note + tag chips; auto-saves via `createServerFn` (`upsertNodeNote`).
- Requires sign-in. Add a lightweight `/auth` route (email + Google) — no protected subtree needed; graph stays public, only note editing gates on auth.

## Technical notes

- All AI + DB calls go through `createServerFn` (never from loaders on the public `/` route).
- `LOVABLE_API_KEY` already provisioned.
- Migration: enable `pgvector`, create both tables with GRANTs + RLS + `has_role` reuse for admin rebuild, add `match_nodes` RPC.
- Chat context builder caps at ~15 nodes / ~4k tokens to stay cheap.
- Google auth configured via `supabase--configure_social_auth` in the same turn.

## Out of scope (this pass)

- Editing graph structure (add/remove nodes/links) from the UI.
- Multi-user shared notes.
- Streaming tool-call agent (single-shot RAG only).

Ship in this order so each step is usable on its own: (1) migration + embeddings rebuild, (2) semantic search toggle, (3) chat panel, (4) auth + notes + auto-tag.
