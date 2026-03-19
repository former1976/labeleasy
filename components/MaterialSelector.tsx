"use client";

export type Material = "vinyl" | "holografisk" | "gennemsigtig" | "glitter";

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
        className="w-full h-full rounded-lg border-2 border-white/40"
        style={{
          background:
            "repeating-linear-gradient(45deg, #888 0px, #888 1px, #fff 1px, #fff 8px)",
          opacity: 0.5,
        }}
      />
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
