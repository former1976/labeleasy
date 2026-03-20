"use client";

export type Material = "vinyl" | "holografisk" | "gennemsigtig" | "glitter" | "sølv" | "kraftpapir";

interface MaterialSelectorProps {
  selected: Material;
  onChange: (material: Material) => void;
}

const MATERIALS: {
  id: Material;
  name: string;
  desc: string;
  priceMultiplier: number;
  preview: React.ReactNode;
}[] = [
  {
    id: "vinyl",
    name: "Vinyl",
    desc: "Holdbar & vandtæt",
    priceMultiplier: 1.0,
    preview: (
      <div className="w-full h-full rounded-lg bg-gradient-to-br from-gray-100 to-white shadow-inner" />
    ),
  },
  {
    id: "holografisk",
    name: "Holografisk",
    desc: "Regnbueeffekt",
    priceMultiplier: 1.5,
    preview: (
      <div
        className="w-full h-full rounded-lg"
        style={{
          background:
            "linear-gradient(135deg, #ff0080, #ff8c00, #40e0d0, #7b2fbe, #ff0080)",
          backgroundSize: "400% 400%",
          animation: "holographic 3s ease infinite",
        }}
      />
    ),
  },
  {
    id: "gennemsigtig",
    name: "Gennemsigtig",
    desc: "Klar folie",
    priceMultiplier: 1.3,
    preview: (
      <div
        className="w-full h-full rounded-lg relative overflow-hidden"
        style={{
          backgroundImage: "linear-gradient(45deg,#bbb 25%,transparent 25%),linear-gradient(-45deg,#bbb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#bbb 75%),linear-gradient(-45deg,transparent 75%,#bbb 75%)",
          backgroundSize: "8px 8px",
          backgroundPosition: "0 0,0 4px,4px -4px,-4px 0",
          backgroundColor: "#e4e4e4",
        }}
      >
        <div className="absolute inset-0 rounded-lg" style={{
          background: "rgba(255,255,255,0.38)",
          backdropFilter: "blur(1px)",
          border: "1px solid rgba(255,255,255,0.65)",
        }} />
        <div className="absolute inset-0 rounded-lg" style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.6) 0%, transparent 40%, rgba(255,255,255,0.2) 100%)",
        }} />
      </div>
    ),
  },
  {
    id: "glitter",
    name: "Glitter",
    desc: "Glitrende effekt",
    priceMultiplier: 1.4,
    preview: (
      <div
        className="w-full h-full rounded-lg"
        style={{
          background:
            "linear-gradient(45deg, #ffd700 25%, #fffacd 50%, #ffd700 75%)",
          backgroundSize: "200% 200%",
          animation: "glitter 1.5s ease infinite",
        }}
      />
    ),
  },
  {
    id: "sølv",
    name: "Sølv",
    desc: "Børstet aluminium",
    priceMultiplier: 1.6,
    preview: (
      <div
        className="w-full h-full rounded-lg relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #b0b0b0 0%, #e8e8e8 18%, #c8c8c8 30%, #f5f5f5 48%, #a8a8a8 62%, #e0e0e0 78%, #c0c0c0 100%)",
        }}
      >
        {/* Brushed metal lines */}
        <div className="absolute inset-0 rounded-lg" style={{
          backgroundImage: "repeating-linear-gradient(98deg, transparent 0px, transparent 1px, rgba(255,255,255,0.55) 1px, rgba(255,255,255,0.55) 2px, transparent 2px, transparent 5px)",
        }} />
        {/* Specular highlight */}
        <div className="absolute inset-0 rounded-lg" style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.75) 0%, transparent 35%, rgba(255,255,255,0.15) 55%, transparent 75%, rgba(255,255,255,0.4) 100%)",
        }} />
      </div>
    ),
  },
  {
    id: "kraftpapir",
    name: "Kraftpapir",
    desc: "Naturlig papirfølelse",
    priceMultiplier: 1.1,
    preview: (
      <div
        className="w-full h-full rounded-lg"
        style={{
          background: "radial-gradient(ellipse at 30% 30%, #c8955a 0%, #b07d45 40%, #9a6a35 100%)",
        }}
      >
        <div className="w-full h-full rounded-lg" style={{
          background: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Crect width='4' height='4' fill='none'/%3E%3Cpath d='M0 2 Q2 1 4 2' stroke='rgba(0,0,0,0.06)' fill='none'/%3E%3C/svg%3E\")",
        }} />
      </div>
    ),
  },
];

export { MATERIALS };

export default function MaterialSelector({
  selected,
  onChange,
}: MaterialSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">
        Materiale
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {MATERIALS.map((mat) => (
          <button
            key={mat.id}
            type="button"
            onClick={() => onChange(mat.id)}
            className={`
              flex flex-col items-center gap-2 p-3 rounded-xl border transition-all
              ${
                selected === mat.id
                  ? "border-[#FFD700] bg-[#FFD700]/10"
                  : "border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10"
              }
            `}
          >
            <div className="w-10 h-10 relative">{mat.preview}</div>
            <div className="text-center">
              <p
                className={`text-xs font-semibold ${
                  selected === mat.id ? "text-[#FFD700]" : "text-white"
                }`}
              >
                {mat.name}
              </p>
              <p className="text-white/40 text-[10px]">{mat.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
