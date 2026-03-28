"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { type Material, MATERIALS } from "./MaterialSelector";
import { type Shape } from "./ShapeSelector";

const SHAPE_NAMES: Record<Shape, string> = {
  diecut: "Fritstående",
  circle: "Rund",
  oval: "Oval",
  rectangle: "Firkantet",
};

interface EditorSidebarProps {
  width: number;
  height: number;
  quantity: number;
  laminate: "glossy" | "mat";
  cornerRadius: number;
  onWidthChange: (v: number) => void;
  onHeightChange: (v: number) => void;
  onQuantityChange: (v: number) => void;
  onLaminateChange: (v: "glossy" | "mat") => void;
  onCornerRadiusChange: (v: number) => void;
  material: Material;
  shape: Shape;
  price: number;
  onAddToCart: () => void;
}

export default function EditorSidebar({
  width,
  height,
  quantity,
  laminate,
  cornerRadius,
  onWidthChange,
  onHeightChange,
  onQuantityChange,
  onLaminateChange,
  onCornerRadiusChange,
  material,
  shape,
  price,
  onAddToCart,
}: EditorSidebarProps) {
  const mat = MATERIALS.find((m) => m.id === material);

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto">
      {/* Size inputs */}
      <div>
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
          Størrelse
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-white/70 text-xs mb-1 block">
              Bredde (mm)
            </Label>
            <Input
              type="number"
              min={10}
              max={1000}
              step={1}
              value={width}
              onChange={(e) => onWidthChange(parseFloat(e.target.value) || 1)}
              className="bg-white/10 border-white/20 text-white focus:border-[#FFD700] h-9"
            />
          </div>
          <div>
            <Label className="text-white/70 text-xs mb-1 block">
              Højde (mm)
            </Label>
            <Input
              type="number"
              min={10}
              max={1000}
              step={1}
              value={height}
              onChange={(e) => onHeightChange(parseFloat(e.target.value) || 1)}
              className="bg-white/10 border-white/20 text-white focus:border-[#FFD700] h-9"
            />
          </div>
        </div>
      </div>

      {/* Quantity */}
      <div>
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
          Antal
        </h3>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[10, 25, 50, 100].map((qty) => (
            <button
              key={qty}
              type="button"
              onClick={() => onQuantityChange(qty)}
              className={`py-2 rounded-lg text-sm font-semibold transition-all ${
                quantity === qty
                  ? "bg-[#FFD700] text-black"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              {qty}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[250, 500, 1000].map((qty) => (
            <button
              key={qty}
              type="button"
              onClick={() => onQuantityChange(qty)}
              className={`py-2 rounded-lg text-sm font-semibold transition-all ${
                quantity === qty
                  ? "bg-[#FFD700] text-black"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              {qty}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Label className="text-white/70 text-xs whitespace-nowrap">
            Andet antal:
          </Label>
          <Input
            type="number"
            min={1}
            max={10000}
            value={quantity}
            onChange={(e) =>
              onQuantityChange(parseInt(e.target.value) || 1)
            }
            className="bg-white/10 border-white/20 text-white focus:border-[#FFD700] h-8 text-sm"
          />
        </div>
      </div>

      {/* Corner radius — only for rectangle shape */}
      {shape === "rectangle" && (
        <div>
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
            Hjørneradius
          </h3>
          <div className="flex items-center gap-3">
            <Slider
              min={0}
              max={Math.round(Math.min(width, height) / 2)}
              step={0.5}
              value={[cornerRadius]}
              onValueChange={(v) => onCornerRadiusChange(Array.isArray(v) ? v[0] : v)}
              className="flex-1"
            />
            <span className="text-white/60 text-xs w-10 text-right">
              {cornerRadius} mm
            </span>
          </div>
        </div>
      )}

      {/* Laminate */}
      <div>
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
          Laminering
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onLaminateChange("glossy")}
            className={`py-2.5 rounded-xl text-sm font-semibold transition-all flex flex-col items-center gap-1 ${
              laminate === "glossy"
                ? "bg-[#FFD700] text-black"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            <span className="text-lg">✨</span>
            Glossy
          </button>
          <button
            type="button"
            onClick={() => onLaminateChange("mat")}
            className={`py-2.5 rounded-xl text-sm font-semibold transition-all flex flex-col items-center gap-1 ${
              laminate === "mat"
                ? "bg-[#FFD700] text-black"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            <span className="text-lg">🔲</span>
            Mat
          </button>
        </div>
      </div>

      {/* Price display */}
      <div className="mt-auto pt-4 border-t border-white/10">
        <div className="bg-white/5 rounded-xl p-4 mb-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-white/60 text-sm">Form</span>
            <span className="text-white text-sm">{SHAPE_NAMES[shape]}</span>
          </div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-white/60 text-sm">Materiale</span>
            <span className="text-white text-sm">{mat?.name}</span>
          </div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-white/60 text-sm">Størrelse</span>
            <span className="text-white text-sm">
              {width} × {height} mm
            </span>
          </div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-white/60 text-sm">Antal</span>
            <span className="text-white text-sm">{quantity} stk</span>
          </div>
          <div className="flex justify-between items-center mb-3">
            <span className="text-white/60 text-sm">Laminering</span>
            <span className="text-white text-sm capitalize">{laminate}</span>
          </div>
          <div className="border-t border-white/10 pt-3 flex justify-between items-center">
            <span className="text-white/60 text-sm">Stykpris</span>
            <span className="text-white/80 text-sm">
              {(price / quantity).toFixed(2)} kr
            </span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-white font-semibold">Total</span>
            <span className="text-[#FFD700] text-2xl font-bold">
              {price.toFixed(0)} kr
            </span>
          </div>
        </div>

        <Button
          onClick={onAddToCart}
          className="w-full bg-[#FFD700] hover:bg-[#FFC200] text-black font-bold py-3 text-base rounded-xl transition-all shadow-lg shadow-[#FFD700]/20 h-12"
        >
          Læg i kurv
        </Button>

        <p className="text-center text-white/30 text-xs mt-3">
          Inkl. moms • Fri fragt over 500 kr
        </p>
      </div>
    </div>
  );
}
