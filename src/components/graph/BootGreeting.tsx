import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { NormalizedGraph } from "@/lib/graph/types";

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const en = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  const pool = en.length ? en : voices;
  const preferred = [/Google UK English Male/i, /Microsoft Guy/i, /Daniel/i, /Alex/i, /Arthur/i];
  for (const rx of preferred) {
    const hit = pool.find((v) => rx.test(v.name));
    if (hit) return hit;
  }
  return pool.find((v) => /male|guy|david|daniel|alex/i.test(v.name)) || pool[0];
}

export function BootGreeting({ graph }: { graph: NormalizedGraph }) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const count = graph.nodes.length;
    const line = `C.A.P.I.S.M. online — ${count} nodes indexed, every star accounted for.`;

    toast(line, {
      duration: 6000,
      className:
        "bg-obsidian-surface border-neon-primary/40 text-white font-mono text-xs",
    });

    const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;
    if (!ttsSupported) return;
    const muted =
      typeof localStorage !== "undefined" && localStorage.getItem("ask:muted") === "1";
    if (muted) return;

    const speak = () => {
      try {
        const voices = window.speechSynthesis.getVoices();
        const voice = pickVoice(voices);
        const u = new SpeechSynthesisUtterance(line);
        if (voice) u.voice = voice;
        u.pitch = 0.85;
        u.rate = 1;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } catch {
        // ignore
      }
    };

    if (window.speechSynthesis.getVoices().length) {
      speak();
    } else {
      const onVoices = () => {
        window.speechSynthesis.onvoiceschanged = null;
        speak();
      };
      window.speechSynthesis.onvoiceschanged = onVoices;
      // Fallback: try after a beat in case voiceschanged never fires.
      setTimeout(speak, 800);
    }
  }, [graph]);

  return null;
}