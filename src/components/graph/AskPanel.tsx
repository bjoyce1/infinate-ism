import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMemo, useState } from "react";
import type { NormalizedGraph } from "@/lib/graph/types";
import { useGraphStore } from "@/lib/graph/useGraphStore";

export function AskPanel({ graph }: { graph: NormalizedGraph }) {
  const selectedId = useGraphStore((s) => s.selectedId);
  const select = useGraphStore((s) => s.select);
  const [input, setInput] = useState("");

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { messages, selectedNodeId: useGraphStore.getState().selectedId },
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, error, stop } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await sendMessage({ text });
  };

  const renderText = (text: string) => {
    // Split around [[node_id]] markers and render clickable chips for known nodes.
    const parts = text.split(/(\[\[[^\]]+\]\])/g);
    return parts.map((p, i) => {
      const m = p.match(/^\[\[([^\]]+)\]\]$/);
      if (!m) return <span key={i}>{p}</span>;
      const id = m[1];
      const node = graph.byId.get(id);
      if (!node) return <span key={i} className="text-muted-text">[[{id}]]</span>;
      return (
        <button
          key={i}
          type="button"
          onClick={() => select(id)}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded bg-neon-primary/10 border border-neon-primary/30 text-neon-primary text-[11px] hover:bg-neon-primary/20"
        >
          {node.label}
        </button>
      );
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-obsidian-border">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-text">Ask your graph</div>
        <div className="text-xs text-white/60 mt-1">
          {selectedId
            ? `Grounded on ${graph.byId.get(selectedId)?.label ?? selectedId} + semantic matches`
            : "Answers cite nodes as clickable chips."}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-xs text-muted-text font-mono space-y-2">
            <div>Try:</div>
            <ul className="space-y-1 list-disc pl-4">
              <li>What is the Art of Ism?</li>
              <li>How does 713mixhouse relate to mrcap1?</li>
              <li>Summarize the AbSoulutely CAPtivating creative flow.</li>
            </ul>
          </div>
        )}
        {messages.map((m) => {
          const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
          return (
            <div key={m.id} className="text-sm leading-relaxed">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-text mb-1">
                {m.role === "user" ? "You" : "Mnemosyne"}
              </div>
              <div className="whitespace-pre-wrap break-words">{renderText(text)}</div>
            </div>
          );
        })}
        {error && (
          <div className="text-xs text-red-400 font-mono">
            {error.message ?? "Chat error"}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="p-3 border-t border-obsidian-border flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your nodes…"
          disabled={busy}
          className="flex-1 bg-obsidian-bg border border-obsidian-border rounded px-3 py-2 text-sm outline-none focus:border-neon-primary/60 disabled:opacity-60"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => stop()}
            className="px-3 py-2 rounded border border-white/20 text-xs font-mono uppercase tracking-widest hover:bg-white/5"
          >
            stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-4 py-2 rounded bg-neon-primary text-obsidian-bg text-xs font-semibold uppercase tracking-widest disabled:opacity-40"
          >
            send
          </button>
        )}
      </form>
    </div>
  );
}