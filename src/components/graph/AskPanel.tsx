import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NormalizedGraph } from "@/lib/graph/types";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import { captureNote } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const en = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  const pool = en.length ? en : voices;
  // Prefer known deep/smooth voices
  const preferred = [
    /Google UK English Male/i,
    /Microsoft Guy/i,
    /Microsoft Davis/i,
    /Daniel/i,
    /Alex/i,
    /Fred/i,
    /Arthur/i,
    /Rishi/i,
  ];
  for (const rx of preferred) {
    const hit = pool.find((v) => rx.test(v.name));
    if (hit) return hit;
  }
  const male = pool.find((v) => /male|guy|david|daniel|alex/i.test(v.name));
  return male || pool[0];
}

function stripForSpeech(text: string): string {
  return text
    .replace(/\[\[([^\]|]+)\]\]/g, "") // remove node id markers
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/[*_#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function AskPanel({ graph }: { graph: NormalizedGraph }) {
  const selectedId = useGraphStore((s) => s.selectedId);
  const select = useGraphStore((s) => s.select);
  const focusMode = useGraphStore((s) => s.focusMode);
  const toggleFocus = useGraphStore((s) => s.toggleFocus);
  const setCommunity = useGraphStore((s) => s.setCommunity);
  const setRightPanel = useGraphStore((s) => s.setRightPanel);
  const addCapture = useGraphStore((s) => s.addCapture);
  const pulseNode = useGraphStore((s) => s.pulseNode);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem("ask:muted") === "1";
  });
  const [voiceReady, setVoiceReady] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(null);
  const spokenIdsRef = useRef<Set<string>>(new Set());
  const flownIdsRef = useRef<Set<string>>(new Set());
  const userUnlockedRef = useRef(false);

  const SR = useMemo(() => getSpeechRecognition(), []);
  const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  // Load voices
  useEffect(() => {
    if (!ttsSupported) return;
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      voiceRef.current = pickVoice(v);
      if (voiceRef.current) setVoiceReady(true);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [ttsSupported]);

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

  const { messages, sendMessage, setMessages, status, error, stop } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";

  const speak = useCallback(
    (text: string) => {
      if (!ttsSupported || muted) return;
      const clean = stripForSpeech(text);
      if (!clean) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(clean);
        if (voiceRef.current) u.voice = voiceRef.current;
        u.rate = 1;
        u.pitch = 0.85;
        u.volume = 1;
        window.speechSynthesis.speak(u);
      } catch {
        // ignore
      }
    },
    [muted, ttsSupported],
  );

  // Speak new assistant messages once streaming is done.
  useEffect(() => {
    if (busy) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (spokenIdsRef.current.has(last.id)) return;
    spokenIdsRef.current.add(last.id);
    const text = last.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    if (text.trim()) speak(text);
  }, [busy, messages, speak]);

  // Fly the constellation to source nodes once the answer settles.
  useEffect(() => {
    if (busy) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (flownIdsRef.current.has(last.id)) return;
    const meta = (last as unknown as { metadata?: { sources?: string[]; topSourceId?: string | null } }).metadata;
    const rawSources = meta?.sources ?? [];
    const validSources = rawSources.filter((id) => graph.byId.has(id));
    if (validSources.length === 0) return;
    flownIdsRef.current.add(last.id);
    const topId = (meta?.topSourceId && graph.byId.has(meta.topSourceId) ? meta.topSourceId : validSources[0]) as string;
    if (validSources.length >= 4) {
      // Cluster reveal: highlight the community, don't tunnel-vision on one node.
      const comm = graph.byId.get(topId)?.community ?? null;
      if (focusMode) toggleFocus();
      if (comm != null) {
        // setCommunity toggles; only set if not already active
        const currentComm = useGraphStore.getState().activeCommunity;
        if (currentComm !== comm) setCommunity(comm);
      }
      select(topId);
    } else {
      // Single source: fly + focus neighborhood
      select(topId);
      if (!focusMode) toggleFocus();
    }
    setRightPanel(true);
  }, [busy, messages, graph, focusMode, toggleFocus, select, setCommunity, setRightPanel]);

  // Cancel speech on unmount / mute
  useEffect(() => {
    if (muted && ttsSupported) window.speechSynthesis.cancel();
  }, [muted, ttsSupported]);

  const unlockAudio = useCallback(() => {
    if (userUnlockedRef.current || !ttsSupported) return;
    try {
      // Play a silent utterance to unlock audio on first interaction.
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
      userUnlockedRef.current = true;
    } catch {
      // ignore
    }
  }, [ttsSupported]);

  const submitText = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || busy) return;
      unlockAudio();
      // "remember that…" → Total Recall capture, not a model call.
      const rememberMatch = t.match(/^\s*remember\s*(?:that|this)?\s*[:,\-—]?\s*(.+)$/is);
      if (rememberMatch && rememberMatch[1].trim().length > 2) {
        const body = rememberMatch[1].trim();
        setInput("");
        await handleCapture(t, body);
        return;
      }
      setInput("");
      await sendMessage({ text: t });
    },
    // handleCapture is stable-enough; deps intentionally minimal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, sendMessage, unlockAudio],
  );

  const witty = (title: string) => {
    const lines = [
      `Locked in, CAP — filed "${title}" next to its kin.`,
      `Got it. That one's a new star now, CAP.`,
      `Consider it remembered. New light in the sky.`,
      `Saved, CAP. The brain just got a little sharper.`,
      `Noted. Fresh node, warm from the press.`,
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  };

  const handleCapture = useCallback(
    async (fullUserText: string, body: string) => {
      // Require sign-in.
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        toast.error("Sign in to save captures", {
          description: "Total Recall stores notes to your account so they persist and reload.",
        });
        return;
      }

      // Echo the user's turn immediately.
      const userMsg: UIMessage = {
        id: `local-${Date.now()}`,
        role: "user",
        parts: [{ type: "text", text: fullUserText }],
      };
      setMessages((m) => [...m, userMsg]);

      // Optimistic thinking bubble.
      const thinkingId = `local-cap-${Date.now()}`;
      setMessages((m) => [
        ...m,
        { id: thinkingId, role: "assistant", parts: [{ type: "text", text: "…capturing…" }] },
      ]);

      try {
        const res = await captureNote({ data: { text: body } });
        addCapture({
          id: res.id,
          label: res.label,
          note: res.note,
          related_node_id: res.related_node_id ?? null,
        });

        // Fly + focus + panel — after next paint so merged graph includes it.
        setTimeout(() => {
          select(res.id);
          if (!focusMode) toggleFocus();
          setRightPanel(true);
          pulseNode(res.id);
          setTimeout(() => pulseNode(null), 2500);
        }, 60);

        const line = witty(res.label);
        setMessages((m) =>
          m.map((msg) =>
            msg.id === thinkingId
              ? { ...msg, parts: [{ type: "text", text: line }] }
              : msg,
          ),
        );
        speak(line);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "capture failed";
        setMessages((m) =>
          m.map((mm) =>
            mm.id === thinkingId
              ? { ...mm, parts: [{ type: "text", text: `Couldn't save that one, CAP — ${msg}` }] }
              : mm,
          ),
        );
        toast.error(msg);
      }
    },
    [setMessages, addCapture, select, focusMode, toggleFocus, setRightPanel, pulseNode, speak],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitText(input);
  };

  const toggleMic = useCallback(() => {
    if (!SR) return;
    unlockAudio();
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    try {
      const rec = new SR();
      rec.lang = "en-US";
      rec.interimResults = true;
      rec.continuous = false;
      let finalText = "";
      rec.onresult = (e: any) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        setInput((finalText + interim).trim());
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => {
        setListening(false);
        recognitionRef.current = null;
        const t = finalText.trim();
        if (t) void submitText(t);
      };
      recognitionRef.current = rec;
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
    }
  }, [SR, listening, submitText, unlockAudio]);

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem("ask:muted", next ? "1" : "0");
      } catch {
        // ignore
      }
      if (next && ttsSupported) window.speechSynthesis.cancel();
      return next;
    });
  };

  const renderText = (text: string) => {
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

  const statusLine = listening
    ? { text: "listening…", color: "text-amber-300", dot: "bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.9)]" }
    : busy
      ? { text: "thinking…", color: "text-purple-300", dot: "bg-purple-300 shadow-[0_0_8px_rgba(216,180,254,0.9)]" }
      : null;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-obsidian-border">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-text">Ask your graph</div>
          {ttsSupported && (
            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={muted}
              title={muted ? "Unmute voice" : "Mute voice"}
              className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded border transition-colors ${
                muted
                  ? "border-white/15 text-muted-text hover:text-white"
                  : "border-amber-300/40 text-amber-300 hover:bg-amber-300/10"
              }`}
            >
              {muted ? "🔇 muted" : "🔊 voice"}
            </button>
          )}
        </div>
        <div className="text-xs text-white/60 mt-1">
          {selectedId
            ? `Grounded on ${graph.byId.get(selectedId)?.label ?? selectedId} + semantic matches`
            : "Answers cite nodes as clickable chips."}
        </div>
        {statusLine && (
          <div className={`mt-2 flex items-center gap-2 text-[11px] font-mono ${statusLine.color}`}>
            <span className={`inline-block h-2 w-2 rounded-full ${statusLine.dot} animate-pulse`} />
            <span>{statusLine.text}</span>
          </div>
        )}
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
            {SR && (
              <div className="pt-2 text-muted-text/80">Tip: tap 🎙 and speak.</div>
            )}
          </div>
        )}
        {messages.map((m) => {
          const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
          return (
            <div key={m.id} className="text-sm leading-relaxed">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-text mb-1">
                {m.role === "user" ? "CAP" : "ISM"}
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
        {SR && (
          <button
            type="button"
            onClick={toggleMic}
            aria-pressed={listening}
            title={listening ? "Stop listening" : "Speak your question"}
            className={`px-3 py-2 rounded border text-sm transition-colors ${
              listening
                ? "border-amber-300 text-amber-300 bg-amber-300/10 animate-pulse"
                : "border-white/20 text-white/80 hover:border-neon-primary/60 hover:text-neon-primary"
            }`}
          >
            🎙
          </button>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={listening ? "Listening…" : "Ask about your nodes…"}
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
      {!voiceReady && ttsSupported && !muted && (
        <div className="px-3 pb-2 text-[10px] font-mono text-muted-text/70">voice loading…</div>
      )}
    </div>
  );
}