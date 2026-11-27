import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { OrbInput } from "@/components/orb";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JARVIS — Painel de controle" },
      { name: "description", content: "Painel futurista do JARVIS com esfera reativa à voz e histórico de conversas." },
      { property: "og:title", content: "JARVIS — Painel de controle" },
      { property: "og:description", content: "Painel futurista do JARVIS com esfera reativa à voz e histórico de conversas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Msg = { role: "user" | "jarvis"; text: string; at: number };
type Conv = { id: string; title: string; at: number; msgs: Msg[] };

const STATES = ["idle", "listening", "thinking", "speaking"] as const;
const LABEL: Record<string, string> = { idle: "Em espera", listening: "Ouvindo", thinking: "Pensando", speaking: "Falando" };
const PHRASES = ["Bom dia, senhor.", "Todos os sistemas estão operacionais.", "A previsão indica céu limpo hoje.", "Posso ajudar com mais alguma coisa?"];
const VOICES = [
  { id: "grave", label: "Grave", pitch: 90, center: 1 },
  { id: "medio", label: "Médio", pitch: 170, center: 3.5 },
  { id: "agudo", label: "Agudo", pitch: 280, center: 6.5 },
] as const;
const KEY = "jarvis-conversas";
const newConv = (): Conv => ({ id: crypto.randomUUID(), title: "Nova conversa", at: Date.now(), msgs: [] });
const hhmm = (t: number) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const data = useRef<OrbInput>({ rms: 0, bands: [], state: "idle" });
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState("idle");
  const [caption, setCaption] = useState("");
  const [url, setUrl] = useState("ws://localhost:8000/ws");
  const [conn, setConn] = useState<"off" | "connecting" | "on">("off");
  const [sim, setSim] = useState(true);
  const [voice, setVoice] = useState<(typeof VOICES)[number]["id"]>("medio");
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState("");
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const simSpeak = useRef(0);
  const activeRef = useRef("");
  activeRef.current = activeId;
  const endRef = useRef<HTMLDivElement>(null);

  const setSt = (s: string) => { data.current.state = s; setState(s); };

  // Load / save history
  useEffect(() => {
    let list: Conv[] = [];
    try { list = JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { /* ignore */ }
    if (!list.length) list = [newConv()];
    setConvs(list); setActiveId(list[0]!.id);
    setNow(Date.now()); const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => { if (convs.length) localStorage.setItem(KEY, JSON.stringify(convs)); }, [convs]);

  const addMsg = (role: Msg["role"], t: string) => {
    if (!t.trim()) return;
    setConvs((cs) => cs.map((c) => c.id !== activeRef.current ? c : {
      ...c, at: Date.now(),
      title: c.title === "Nova conversa" && role === "user" ? t.slice(0, 40) : c.title,
      msgs: [...c.msgs, { role, text: t, at: Date.now() }],
    }));
  };

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
      try { ws = new WebSocket(url); wsRef.current = ws; } catch { timer = setTimeout(open, 1500); return; }
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
          } else if (m.type === "caption") { setCaption(m.text ?? ""); if (m.final !== false) addMsg("jarvis", m.text ?? ""); }
          else if (m.type === "transcript") addMsg("user", m.text ?? "");
        } catch { /* ignore */ }
      };
    };
    open();
    return () => { stop = true; clearTimeout(timer); ws?.close(); wsRef.current = null; };
  }, [sim, url]);

  // Simulation
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
          const w = Math.exp(-Math.pow(i - profile.center, 2) / 4);
          return Math.min(1, d.rms * w * (0.75 + Math.random() * 0.35));
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

  const speak = (p = PHRASES[Math.floor(Math.random() * PHRASES.length)] ?? "") => {
    setCaption(p); setSt("speaking"); addMsg("jarvis", p);
    simSpeak.current = performance.now() + 1500 + p.length * 60;
  };

  const send = () => {
    const t = text.trim(); if (!t) return;
    addMsg("user", t); setText("");
    if (sim) { setSt("thinking"); setTimeout(() => speak(), 900); }
    else wsRef.current?.send(JSON.stringify({ type: "user_text", text: t }));
  };

  const active = convs.find((c) => c.id === activeId);
  const shown = convs.filter((c) => c.title.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.at - a.at);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [active?.msgs.length]);

  const createConv = () => { const c = newConv(); setConvs((cs) => [c, ...cs]); setActiveId(c.id); };
  const removeConv = (id: string) => setConvs((cs) => {
    const rest = cs.filter((c) => c.id !== id);
    const list = rest.length ? rest : [newConv()];
    if (id === activeId) setActiveId(list[0]!.id);
    return list;
  });

  const status = sim ? "SIMULAÇÃO" : conn === "on" ? "CONECTADO" : "RECONECTANDO…";

  return (
    <main className="hud-grid flex h-screen w-full overflow-hidden bg-background font-mono text-foreground">
      {/* Sidebar */}
      <aside className="z-10 flex w-72 shrink-0 flex-col border-r border-border bg-card/40 backdrop-blur-md max-md:hidden">
        <div className="border-b border-border p-5">
          <p className="text-lg tracking-[0.5em] text-primary">J.A.R.V.I.S</p>
          <p className="mt-1 text-[10px] tracking-[0.3em] text-muted-foreground">SISTEMA DE ASSISTÊNCIA</p>
        </div>
        <div className="space-y-2 p-4">
          <button onClick={createConv} className="hud-corners w-full border border-primary/50 bg-primary/10 px-3 py-2 text-xs tracking-[0.2em] text-primary hover:bg-primary/20">
            + NOVA CONVERSA
          </button>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar no histórico…"
            className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-xs outline-none focus:border-primary" />
        </div>
        <p className="px-5 pb-2 text-[10px] tracking-[0.3em] text-muted-foreground">HISTÓRICO · {convs.length}</p>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {shown.map((c) => (
            <div key={c.id} className={`group relative rounded-md border px-3 py-2 text-xs transition ${c.id === activeId ? "border-primary/60 bg-primary/10" : "border-transparent hover:border-border hover:bg-secondary/40"}`}>
              <button onClick={() => setActiveId(c.id)} className="block w-full text-left">
                <span className="block truncate pr-5">{c.title}</span>
                <span className="text-[10px] text-muted-foreground">{c.msgs.length} msgs · {hhmm(c.at)}</span>
              </button>
              <button onClick={() => removeConv(c.id)} aria-label="Apagar conversa"
                className="absolute right-2 top-2 hidden text-muted-foreground hover:text-destructive group-hover:block">×</button>
            </div>
          ))}
        </nav>
        <div className="space-y-1 border-t border-border p-4 text-[10px] tracking-[0.2em] text-muted-foreground">
          <div className="flex justify-between"><span>LINK</span><span className={conn === "on" ? "text-primary" : "text-accent"}>{status}</span></div>
          <div className="flex justify-between"><span>NÚCLEO</span><span>{LABEL[state]?.toUpperCase()}</span></div>
          <div className="flex justify-between"><span>HORA</span><span>{now ? new Date(now).toLocaleTimeString("pt-BR") : "--:--:--"}</span></div>
        </div>
      </aside>

      {/* Center */}
      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="z-10 flex items-center justify-between border-b border-border px-6 py-3 text-[10px] tracking-[0.3em] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className={`h-2 w-2 rounded-full ${conn === "on" ? "bg-primary" : sim ? "bg-accent" : "bg-destructive"} animate-pulse`} />
            {status}
          </div>
          <span className="truncate px-4">{active?.title.toUpperCase()}</span>
          <span>v2.0</span>
        </header>

        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-0 orb-glow" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(70vh,80%)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/15 hud-spin" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(80vh,90%)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-accent/20 hud-spin-rev" />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-x-0 bottom-6 text-center">
            <p className="text-xs uppercase tracking-[0.4em] text-primary">{LABEL[state] ?? state}</p>
            <p className="mx-auto mt-2 min-h-7 max-w-xl px-4 font-sans text-lg font-light">{caption}</p>
          </div>
        </div>

        <div className="z-10 space-y-2 border-t border-border bg-card/40 p-4 backdrop-blur-md">
          <div className="flex gap-2">
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Fale com o JARVIS…" className="flex-1 rounded-md border border-input bg-background/60 px-4 py-3 text-sm outline-none focus:border-primary" />
            <button onClick={send} className="rounded-md bg-primary px-5 text-xs tracking-[0.2em] text-primary-foreground">ENVIAR</button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <button onClick={() => setSim(!sim)} className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">
              {sim ? "Usar WebSocket" : "Usar simulação"}
            </button>
            {sim ? (
              <>
                <button onClick={() => speak()} className="rounded-md border border-primary/50 px-3 py-1.5 text-primary hover:bg-primary/10">Simular fala</button>
                <div className="flex items-center gap-1 rounded-md border border-border p-0.5" aria-label="Tom da voz simulada">
                  <span className="px-2 text-muted-foreground">Tom</span>
                  {VOICES.map((v) => (
                    <button key={v.id} onClick={() => setVoice(v.id)} aria-pressed={voice === v.id}
                      className={`rounded px-2 py-1 ${voice === v.id ? "bg-secondary" : "hover:bg-secondary"}`}>{v.label}</button>
                  ))}
                </div>
                {STATES.filter((s) => s !== "speaking").map((s) => (
                  <button key={s} onClick={() => { setSt(s); setCaption(""); }}
                    className={`rounded-md px-3 py-1.5 ${state === s ? "bg-secondary" : "hover:bg-secondary"}`}>{LABEL[s]}</button>
                ))}
              </>
            ) : (
              <input value={url} onChange={(e) => setUrl(e.target.value)} className="w-64 rounded-md border border-input bg-background px-3 py-1.5" />
            )}
          </div>
        </div>
      </section>

      {/* Transcript */}
      <aside className="z-10 flex w-80 shrink-0 flex-col border-l border-border bg-card/40 backdrop-blur-md max-lg:hidden">
        <p className="border-b border-border px-5 py-3 text-[10px] tracking-[0.3em] text-muted-foreground">TRANSCRIÇÃO</p>
        <div className="flex-1 space-y-3 overflow-y-auto p-4 font-sans text-sm">
          {!active?.msgs.length && <p className="pt-10 text-center font-mono text-xs text-muted-foreground">Nenhuma mensagem ainda.</p>}
          {active?.msgs.map((m, i) => (
            <div key={i} className={`rounded-lg border px-3 py-2 ${m.role === "user" ? "ml-6 border-accent/40 bg-accent/10" : "mr-6 border-primary/40 bg-primary/10"}`}>
              <p className={`mb-1 font-mono text-[10px] tracking-[0.2em] ${m.role === "user" ? "text-accent" : "text-primary"}`}>
                {m.role === "user" ? "VOCÊ" : "JARVIS"} · {hhmm(m.at)}
              </p>
              {m.text}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </aside>
    </main>
  );
}
