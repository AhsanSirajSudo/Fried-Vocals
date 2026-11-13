"use client";

import { useRef, useState } from "react";
import { PitchDetector } from "pitchy";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function freqToNote(freq: number) {
  const n = 12 * Math.log2(freq / 440) + 69;
  const midi = Math.round(n);
  return {
    name: `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`,
    cents: Math.round((n - midi) * 100),
  };
}

export default function Home() {
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState("--");
  const [hz, setHz] = useState(0);
  const [cents, setCents] = useState(0);
  const [threshold, setThreshold] = useState(0.02);
  const thresholdRef = useRef(0.02);

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

      // Measure volume (RMS) for the noise threshold slider
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
      const rms = Math.sqrt(sum / buffer.length);

      if (rms > thresholdRef.current) {
        const [pitch, clarity] = detector.findPitch(buffer, ctx.sampleRate);
        if (clarity > 0.88 && pitch > 60 && pitch < 1200) {
          const info = freqToNote(pitch);
          setHz(Math.round(pitch * 10) / 10);
          setNote(info.name);
          setCents(info.cents);
        }
      }
      requestAnimationFrame(loop);
    };

    loop();
  }

  const isInTune = listening && note !== "--" && Math.abs(cents) <= 15;

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold text-slate-300">Vocal Pitch Trainer</h1>

      <div
        className={`w-64 h-64 rounded-full flex flex-col items-center justify-center border-4 transition-colors ${
          isInTune
            ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
            : "bg-slate-900 border-slate-700 text-white"
        }`}
      >
        <span className="text-6xl font-extrabold">{note}</span>
        <span className="text-sm text-slate-400 mt-2">
          {hz > 0 ? `${hz} Hz (${cents >= 0 ? `+${cents}` : cents} cents)` : "Sing a note"}
        </span>
      </div>

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