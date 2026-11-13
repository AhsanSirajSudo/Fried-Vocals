"use client";

import { useRef, useState } from "react";
import { PitchDetector } from "pitchy";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SARGAM_NAMES = ["Sa", "re", "Re", "ga", "Ga", "Ma", "Ma'", "Pa", "dha", "Dha", "ni", "Ni"];

function midiToWestern(midi: number) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function freqToNoteInfo(freq: number, rootOffset: number) {
  const n = 12 * Math.log2(freq / 440) + 69;
  const midi = Math.round(n);
  const sargamIndex = (((midi - rootOffset) % 12) + 12) % 12;

  return {
    midi,
    western: midiToWestern(midi),
    sargam: SARGAM_NAMES[sargamIndex],
    cents: Math.round((n - midi) * 100),
  };
}

export default function Home() {
  const [listening, setListening] = useState(false);
  const [western, setWestern] = useState("--");
  const [sargam, setSargam] = useState("--");
  const [hz, setHz] = useState(0);
  const [cents, setCents] = useState(0);

  const [threshold, setThreshold] = useState(0.02);
  const thresholdRef = useRef(0.02);

  const [rootSa, setRootSa] = useState(0); // 0 = C, 1 = C#, etc.
  const rootSaRef = useRef(0);

  const [minMidi, setMinMidi] = useState<number | null>(null);
  const [maxMidi, setMaxMidi] = useState<number | null>(null);
  const stableNoteRef = useRef<{ midi: number; count: number }>({ midi: -1, count: 0 });

  async function startMic() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const detector = PitchDetector.forFloat32Array(analyser.fftSize);
    const buffer = new Float32Array(detector.inputLength);
    setListening(true);

    const loop = () => {
      analyser.getFloatTimeDomainData(buffer);

      let sum = 0;
      for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
      const rms = Math.sqrt(sum / buffer.length);

      if (rms > thresholdRef.current) {
        const [pitch, clarity] = detector.findPitch(buffer, ctx.sampleRate);
        if (clarity > 0.88 && pitch > 60 && pitch < 1200) {
          const info = freqToNoteInfo(pitch, rootSaRef.current);
          setHz(Math.round(pitch * 10) / 10);
          setWestern(info.western);
          setSargam(info.sargam);
          setCents(info.cents);

          // Update vocal range only after holding a note steady for 15 frames
          if (stableNoteRef.current.midi === info.midi) {
            stableNoteRef.current.count += 1;
            if (stableNoteRef.current.count === 15) {
              setMinMidi((prev) => (prev === null || info.midi < prev ? info.midi : prev));
              setMaxMidi((prev) => (prev === null || info.midi > prev ? info.midi : prev));
            }
          } else {
            stableNoteRef.current = { midi: info.midi, count: 1 };
          }
        }
      }
      requestAnimationFrame(loop);
    };

    loop();
  }

  const isInTune = listening && western !== "--" && Math.abs(cents) <= 15;

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold tracking-wide text-slate-200">Fried Vocals</h1>

      {/* Root Sa Selector */}
      <div className="flex items-center gap-3 bg-slate-900 px-4 py-2 rounded-xl border border-slate-800">
        <label className="text-sm text-slate-400">Select Sa (Root):</label>
        <select
          value={rootSa}
          onChange={(e) => {
            const val = Number(e.target.value);
            setRootSa(val);
            rootSaRef.current = val;
          }}
          className="bg-slate-800 text-emerald-400 font-semibold px-3 py-1 rounded-lg outline-none"
        >
          {NOTE_NAMES.map((noteName, index) => (
            <option key={noteName} value={index}>
              {noteName}
            </option>
          ))}
        </select>
      </div>

      {/* Main Pitch Circle */}
      <div
        className={`w-64 h-64 rounded-full flex flex-col items-center justify-center border-4 transition-colors ${
          isInTune
            ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
            : "bg-slate-900 border-slate-700 text-white"
        }`}
      >
        <span className="text-6xl font-extrabold">{sargam}</span>
        <span className="text-xl font-semibold text-slate-300 mt-1">{western}</span>
        <span className="text-xs text-slate-400 mt-2">
          {hz > 0 ? `${hz} Hz (${cents >= 0 ? `+${cents}` : cents} cents)` : "Sing a note"}
        </span>
      </div>

      {/* Vocal Range Display */}
      <div className="w-64 bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400">Detected Vocal Range</p>
          <p className="text-base font-bold text-slate-200">
            {minMidi !== null && maxMidi !== null
              ? `${midiToWestern(minMidi)} — ${midiToWestern(maxMidi)}`
              : "Sing low & high notes"}
          </p>
        </div>
        {(minMidi !== null || maxMidi !== null) && (
          <button
            onClick={() => {
              setMinMidi(null);
              setMaxMidi(null);
            }}
            className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
          >
            Reset
          </button>
        )}
      </div>

      {/* Noise Threshold Slider */}
      <div className="w-64 flex flex-col gap-2">
        <label className="text-sm text-slate-400 flex justify-between">
          <span>Noise Threshold</span>
          <span>{threshold.toFixed(3)}</span>
        </label>
        <input
          type="range"
          min="0.005"
          max="0.1"
          step="0.005"
          value={threshold}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            setThreshold(val);
            thresholdRef.current = val;
          }}
          className="accent-emerald-400"
        />
      </div>

      {!listening && (
        <button
          onClick={startMic}
          className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold cursor-pointer"
        >
          Start Microphone
        </button>
      )}
    </main>
  );
}