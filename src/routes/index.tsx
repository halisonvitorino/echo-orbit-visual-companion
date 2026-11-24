import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { OrbInput } from "@/components/orb";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JARVIS — Esfera reativa" },
      { name: "description", content: "Interface futurista do JARVIS que reage à voz via WebSocket." },
      { property: "og:title", content: "JARVIS — Esfera reativa" },
      { property: "og:description", content: "Interface futurista do JARVIS que reage à voz via WebSocket." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const STATES = ["idle", "listening", "thinking", "speaking"] as const;
const LABEL: Record<string, string> = { idle: "Em espera", listening: "Ouvindo", thinking: "Pensando", speaking: "Falando" };
const PHRASES = ["Bom dia, senhor.", "Todos os sistemas estão operacionais.", "A previsão indica céu limpo hoje.", "Posso ajudar com mais alguma coisa?"];
const VOICES = [
  { id: "grave", label: "Grave", pitch: 90, center: 1 },
  { id: "medio", label: "Médio", pitch: 170, center: 3.5 },
  { id: "agudo", label: "Agudo", pitch: 280, center: 6.5 },
] as const;

function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const data = useRef<OrbInput>({ rms: 0, bands: [], state: "idle" });
  const [state, setState] = useState("idle");
  const [caption, setCaption] = useState("");
  const [url, setUrl] = useState("ws://localhost:8000/ws");
  const [conn, setConn] = useState<"off" | "connecting" | "on">("off");
  const [sim, setSim] = useState(true);
  const [voice, setVoice] = useState<(typeof VOICES)[number]["id"]>("medio");
  const simSpeak = useRef(0);

  const setSt = (s: string) => { data.current.state = s; setState(s); };

  useEffect(() => {
    let dispose: (() => void) | undefined; let alive = true;
    import("@/components/orb").then(({ createOrb }) => {
      if (alive && canvasRef.current) dispose = createOrb(canvasRef.current, () => data.current);
    });
    return () => { alive = false; dispose?.(); };
  }, []);

  // WebSocket with auto-reconnect
  useEffect(() => {
    if (sim) { setConn("off"); return; }
    let ws: WebSocket | null = null; let timer: ReturnType<typeof setTimeout>; let stop = false;
    const open = () => {
      setConn("connecting");
      try { ws = new WebSocket(url); } catch { timer = setTimeout(open, 1500); return; }
      ws.onopen = () => setConn("on");
      ws.onclose = () => { setConn("connecting"); if (!stop) timer = setTimeout(open, 1500); };
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          if (m.type === "state") setSt(m.value);
          else if (m.type === "audio") {
            data.current.rms = m.rms ?? 0;
            data.current.bands = m.bands ?? [];
            if (typeof m.pitch === "number" && Number.isFinite(m.pitch) && m.pitch > 0) data.current.pitch = m.pitch;
            else delete data.current.pitch;
          }
          else if (m.type === "caption") setCaption(m.text ?? "");
        } catch { /* ignore */ }
      };
    };
    open();
    return () => { stop = true; clearTimeout(timer); ws?.close(); };
  }, [sim, url]);

  // Simulation: fake syllables
  useEffect(() => {
    if (!sim) return;
    let raf = 0; const t0 = performance.now();
    const tick = () => {
      const t = (performance.now() - t0) / 1000; const d = data.current;
      if (d.state === "speaking" && performance.now() < simSpeak.current) {
        const env = Math.max(0, Math.sin(t * 9) * 0.5 + Math.sin(t * 23) * 0.3 + 0.35);
        const profile = VOICES.find((item) => item.id === voice) ?? VOICES[1];
        d.rms = Math.min(1, env * (0.6 + Math.random() * 0.4));
        d.pitch = profile.pitch * (1 + Math.sin(t * 3.1) * 0.06);
        d.bands = Array.from({ length: 8 }, (_, i) => {
          const frequencyWeight = Math.exp(-Math.pow(i - profile.center, 2) / 4);
          return Math.min(1, d.rms * frequencyWeight * (0.75 + Math.random() * 0.35));
        });
      } else {
        if (d.state === "speaking") { setSt("idle"); setCaption(""); }
        d.rms = 0; d.bands = []; delete d.pitch;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [sim, voice]);

  const speak = () => {
    const p = PHRASES[Math.floor(Math.random() * PHRASES.length)] ?? "";
    setCaption(p); setSt("speaking"); simSpeak.current = performance.now() + 1500 + p.length * 60;
  };

  return (
    <main className="relative h-screen w-full overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 orb-glow" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <header className="absolute left-6 top-5 flex items-center gap-3 font-mono text-xs tracking-[0.3em] text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${conn === "on" ? "bg-primary" : sim ? "bg-accent" : "bg-destructive"} animate-pulse`} />
        J.A.R.V.I.S · {sim ? "SIMULAÇÃO" : conn === "on" ? "CONECTADO" : "RECONECTANDO…"}
      </header>

      <div className="absolute inset-x-0 bottom-40 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.4em] text-muted-foreground">{LABEL[state] ?? state}</p>
        <p className="mx-auto mt-3 min-h-8 max-w-xl px-4 text-xl font-light">{caption}</p>
      </div>

      <div className="absolute inset-x-0 bottom-6 mx-auto flex w-fit max-w-[95vw] flex-wrap items-center justify-center gap-2 rounded-2xl border border-border bg-card/60 p-3 font-mono text-xs backdrop-blur">
        <button onClick={() => setSim(!sim)} className="rounded-lg border border-border px-3 py-2 hover:bg-secondary">
          {sim ? "Usar WebSocket" : "Usar simulação"}
        </button>
        {sim ? (
          <>
            <button onClick={speak} className="rounded-lg bg-primary px-3 py-2 text-primary-foreground">Simular fala</button>
            <div className="flex items-center gap-1 rounded-lg border border-border p-1" aria-label="Tom da voz simulada">
              <span className="px-2 text-muted-foreground">Tom</span>
              {VOICES.map((item) => (
                <button key={item.id} onClick={() => setVoice(item.id)} aria-pressed={voice === item.id}
                  className={`rounded-md px-2 py-1 ${voice === item.id ? "bg-secondary" : "hover:bg-secondary"}`}>
                  {item.label}
                </button>
              ))}
            </div>
            {STATES.filter((s) => s !== "speaking").map((s) => (
              <button key={s} onClick={() => { setSt(s); setCaption(""); }}
                className={`rounded-lg px-3 py-2 ${state === s ? "bg-secondary" : "hover:bg-secondary"}`}>{LABEL[s]}</button>
            ))}
          </>
        ) : (
          <input value={url} onChange={(e) => setUrl(e.target.value)}
            className="w-64 rounded-lg border border-input bg-background px-3 py-2" />
        )}
      </div>
    </main>
  );
}
