"use client";

export type Shape = "diecut" | "circle" | "oval" | "rounded" | "rectangle";

interface ShapeSelectorProps {
  selected: Shape;
  onChange: (shape: Shape) => void;
}

function ShapeIcon({ id, active }: { id: Shape; active: boolean }) {
  const fg = active ? "#FFD700" : "rgba(255,255,255,0.65)";
  const bg = active ? "rgba(255,215,0,0.15)" : "rgba(255,255,255,0.06)";

  switch (id) {
    case "diecut":
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path
            d="M14 4c1.8 0 4.5 0.8 6.5 2.8S24 11.5 24 15c0 3.8-1.8 6.5-4.5 8S15 25 14 25s-3.5-0.8-5.5-2S4 18.8 4 15c0-3.5 1.5-6 3.5-8.2S12.2 4 14 4z"
            fill={bg}
            stroke={fg}
            strokeWidth="1.5"
          />
          <path
            d="M14 4c1.8 0 4.5 0.8 6.5 2.8S24 11.5 24 15c0 3.8-1.8 6.5-4.5 8S15 25 14 25s-3.5-0.8-5.5-2S4 18.8 4 15c0-3.5 1.5-6 3.5-8.2S12.2 4 14 4z"
            fill="none"
            stroke={fg}
            strokeWidth="1"
            strokeDasharray="2.5 2"
            strokeOpacity="0.5"
            transform="scale(1.18) translate(-2.1 -2.1)"
          />
        </svg>
      );
    case "circle":
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="11" fill={bg} stroke={fg} strokeWidth="1.5" />
        </svg>
      );
    case "oval":
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <ellipse cx="14" cy="14" rx="12" ry="8" fill={bg} stroke={fg} strokeWidth="1.5" />
        </svg>
      );
    case "rounded":
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="2" y="2" width="24" height="24" rx="6" fill={bg} stroke={fg} strokeWidth="1.5" />
        </svg>
      );
    case "rectangle":
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="2" y="2" width="24" height="24" rx="1.5" fill={bg} stroke={fg} strokeWidth="1.5" />
        </svg>
      );
  }
}

const SHAPES: { id: Shape; name: string; desc: string }[] = [
  { id: "diecut", name: "Fritstående", desc: "Skæres tæt på motivet" },
  { id: "circle", name: "Rund", desc: "Perfekt cirkel" },
  { id: "oval", name: "Oval", desc: "Aflang ellipse" },
  { id: "rounded", name: "Afrundet", desc: "Bløde hjørner" },
  { id: "rectangle", name: "Firkantet", desc: "Skarpe hjørner" },
];

export default function ShapeSelector({ selected, onChange }: ShapeSelectorProps) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
        Form
      </h3>
      <div className="flex flex-col gap-1.5">
        {SHAPES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-all text-left w-full ${
              selected === s.id
                ? "border-[#FFD700] bg-[#FFD700]/10"
                : "border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10"
            }`}
          >
            <ShapeIcon id={s.id} active={selected === s.id} />
            <div>
              <p
                className={`text-xs font-semibold leading-tight ${
                  selected === s.id ? "text-[#FFD700]" : "text-white"
                }`}
              >
                {s.name}
              </p>
              <p className="text-white/40 text-[10px] leading-tight mt-0.5">
                {s.desc}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
