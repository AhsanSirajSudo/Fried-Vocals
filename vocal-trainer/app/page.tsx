"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PitchDetector } from "pitchy";

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SYSTEMS = {
  sargam: ["Sa", "re", "Re", "ga", "Ga", "Ma", "Ma'", "Pa", "dha", "Dha", "ni", "Ni"],
  solfege: ["Do", "Ra", "Re", "Me", "Mi", "Fa", "Fi", "Sol", "Le", "La", "Te", "Ti"],
};
type Mode = "none" | keyof typeof SYSTEMS;
type Range = { min: number | null; max: number | null };

const MAX_RMS = 0.2; // volume that fills the meter
const midiToWestern = (m: number) => `${NOTES[m % 12]}${Math.floor(m / 12) - 1}`;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function usePitchTracker(threshold: number) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState({ midi: null as number | null, hz: 0, cents: 0 });
  const [range, setRange] = useState<Range>({ min: null, max: null });

  const audio = useRef<{ ctx?: AudioContext; stream?: MediaStream; raf?: number }>({});
  const orb = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const vol = useRef<HTMLSpanElement>(null);

  const thr = useRef(threshold);
  const s = useRef({ count: 0, silence: 0, midi: null as number | null, rms: 0, offset: 0, hue: 0, stable: { midi: -1, count: 0 } });
  useEffect(() => { thr.current = threshold; }, [threshold]);

  const stop = useCallback(async () => {
    const { ctx, stream, raf } = audio.current;
    if (raf !== undefined) cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    if (ctx && ctx.state !== "closed") await ctx.close();
    audio.current = {};
  }, []);
  useEffect(() => () => void stop(), [stop]); // release mic on unmount

  const start = useCallback(async () => {
    await stop();
    setError(null);

    let stream: MediaStream;
    try {
      // Browser auto-processing (esp. auto gain) makes level drift on steady sound
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { autoGainControl: false, noiseSuppression: false, echoCancellation: false },
      });
    } catch {
      return setError("Microphone access was blocked. Allow it in your browser settings and try again.");
    }

    const ctx = new AudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(analyser);
    audio.current = { ctx, stream };

    const detector = PitchDetector.forFloat32Array(analyser.fftSize);
    const buf = new Float32Array(detector.inputLength);
    const st = s.current;
    Object.assign(st, { count: 0, silence: 0, midi: null, rms: 0 });
    setListening(true);

    const loop = () => {
      if (ctx.state === "suspended") void ctx.resume();
      analyser.getFloatTimeDomainData(buf);

      // Volume meter
      const rms = Math.sqrt(buf.reduce((sum, x) => sum + x * x, 0) / buf.length);
      const active = rms > thr.current;
      st.rms = lerp(st.rms, rms, rms > st.rms ? 0.18 : 0.08);
      const pct = Math.min(100, (st.rms / MAX_RMS) * 100);
      if (bar.current) Object.assign(bar.current.style, { width: `${pct}%`, backgroundColor: active ? "#34d399" : "#64748b" });
      if (vol.current && st.count % 6 === 0) vol.current.textContent = `Vol: ${pct.toFixed(1)}%`;

      if (!active) {
        if (++st.silence > 15) {
          st.midi = null;
          if (orb.current) orb.current.style.opacity = "0";
        }
      } else {
        const [pitch, clarity] = detector.findPitch(buf, ctx.sampleRate);
        if (clarity > 0.78 && pitch > 60 && pitch < 1200) {
          st.silence = 0;

          // Smooth the note; large jumps snap instead of glide
          const raw = 12 * Math.log2(pitch / 440) + 69;
          st.midi = st.midi === null || Math.abs(raw - st.midi) > 0.65 ? raw : lerp(st.midi, raw, 0.09);
          const midi = Math.round(st.midi);
          const cents = (st.midi - midi) * 100;

          // Orb: position and color follow how far off-pitch you are
          if (orb.current && track.current) {
            const c = Math.max(-50, Math.min(50, cents));
            st.offset = lerp(st.offset, (c / 50) * (track.current.clientWidth / 2 - 28), 0.15);
            st.hue = lerp(st.hue, Math.pow(1 - Math.abs(c) / 50, 1.8) * 145, 0.15);
            const color = `hsl(${Math.round(st.hue)}, 90%, 50%)`;
            Object.assign(orb.current.style, {
              opacity: "1",
              transform: `translate3d(${st.offset.toFixed(2)}px, 0, 0)`,
              backgroundColor: color,
              boxShadow: `0 0 18px ${color}`,
            });
          }

          if (st.count % 3 === 0) setNote({ midi, hz: Math.round(pitch * 10) / 10, cents: Math.round(cents) });

          // A note held for 15 frames counts toward the vocal range
          st.stable = { midi, count: st.stable.midi === midi ? st.stable.count + 1 : 1 };
          if (st.stable.count === 15) {
            setRange((r) => ({
              min: r.min === null || midi < r.min ? midi : r.min,
              max: r.max === null || midi > r.max ? midi : r.max,
            }));
          }
        }
      }

      st.count++;
      audio.current.raf = requestAnimationFrame(loop);
    };
    audio.current.raf = requestAnimationFrame(loop);
  }, [stop]);

  return { listening, error, note, range, setRange, start, orb, track, bar, vol };
}

export default function Home() {
  const [threshold, setThreshold] = useState(0.01);
  const [root, setRoot] = useState(0);
  const [mode, setMode] = useState<Mode>("none");
  const { listening, error, note, range, setRange, start, orb, track, bar, vol } = usePitchTracker(threshold);

  const { midi, hz, cents } = note;
  const western = midi !== null ? midiToWestern(midi) : "--";
  const relative = midi !== null && mode !== "none" ? SYSTEMS[mode][(((midi - root) % 12) + 12) % 12] : "--";
  const inTune = listening && midi !== null && Math.abs(cents) <= 7;
  const thresholdPct = Math.min(100, (threshold / MAX_RMS) * 100);
  const hasRange = range.min !== null && range.max !== null;

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-2xl font-bold tracking-wide text-slate-200">Fried Vocals</h1>

      {/* Scale controls */}
      <div className="flex flex-wrap items-center justify-center gap-3 bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">System:</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className="bg-slate-800 text-slate-200 text-sm font-medium px-2.5 py-1 rounded-lg outline-none cursor-pointer"
          >
            <option value="none">Note Only (C D E)</option>
            <option value="sargam">Sargam (Sa Re Ga)</option>
            <option value="solfege">Solfège (Do Re Mi)</option>
          </select>
        </div>

        {mode !== "none" && (
          <>
            <div className="h-4 w-[1px] bg-slate-700" />
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">{mode === "sargam" ? "Root (Sa):" : "Root (Do):"}</label>
              <select
                value={root}
                onChange={(e) => setRoot(Number(e.target.value))}
                className="bg-slate-800 text-emerald-400 text-sm font-semibold px-2.5 py-1 rounded-lg outline-none cursor-pointer"
              >
                {NOTES.map((name, i) => (
                  <option key={name} value={i}>{name}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Pitch gauge */}
      <div className="relative flex items-center justify-center w-full max-w-[540px] h-48 my-2">
        <div
          ref={track}
          className="absolute inset-x-0 h-16 rounded-full bg-slate-900/90 border-2 border-slate-800 flex items-center justify-between px-5 text-sm font-bold text-slate-500 select-none"
        >
          <span>♭</span>
          <span>♯</span>
        </div>

        <div
          ref={orb}
          className="absolute z-10 w-10 h-10 rounded-full border-2 border-white/90 pointer-events-none transition-opacity duration-150"
          style={{ opacity: 0 }}
        />

        <div
          className={`relative z-20 shrink-0 w-44 h-44 rounded-full flex flex-col items-center justify-center border-4 transition-colors duration-150 ${
            inTune
              ? "bg-slate-950 border-emerald-400 text-emerald-300 shadow-[0_0_30px_rgba(16,185,129,0.3)]"
              : "bg-slate-950 border-slate-700 text-white"
          }`}
        >
          {mode === "none" ? (
            <span className="text-5xl font-extrabold">{western}</span>
          ) : (
            <>
              <span className="text-5xl font-extrabold">{relative}</span>
              <span className="text-lg font-semibold text-slate-300 mt-1">{western}</span>
            </>
          )}
          <span className="text-xs text-slate-400 mt-1.5">
            {hz > 0 ? `${hz} Hz (${cents >= 0 ? "+" : ""}${cents}¢)` : "Sing a note"}
          </span>
        </div>
      </div>

      {/* Vocal range */}
      <div className="w-64 bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400">Detected Vocal Range</p>
          <p className="text-base font-bold text-slate-200">
            {hasRange ? `${midiToWestern(range.min!)} — ${midiToWestern(range.max!)}` : "Sing low & high notes"}
          </p>
        </div>
        {hasRange && (
          <button
            onClick={() => setRange({ min: null, max: null })}
            className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
          >
            Reset
          </button>
        )}
      </div>

      {/* Noise threshold + live volume meter */}
      <div className="w-64 flex flex-col gap-2">
        <label className="text-sm text-slate-400 flex justify-between">
          <span>Noise Threshold</span>
          <span>{thresholdPct.toFixed(1)}%</span>
        </label>

        <div className="relative w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
          <div ref={bar} className="h-full bg-emerald-400 transition-none" style={{ width: "0%" }} />
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_4px_#fff]"
            style={{ left: `${thresholdPct}%` }}
          />
        </div>

        <input
          type="range"
          min="0"
          max={MAX_RMS}
          step="0.001"
          value={threshold}
          onChange={(e) => setThreshold(parseFloat(e.target.value))}
          className="accent-emerald-400"
        />

        <span ref={vol} className="text-xs text-slate-500 text-right">Vol: 0.0%</span>
      </div>

      {error && <p className="text-sm text-red-400 max-w-64 text-center">{error}</p>}

      {!listening && (
        <button
          onClick={start}
          className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold cursor-pointer"
        >
          Start Microphone
        </button>
      )}
    </main>
  );
}