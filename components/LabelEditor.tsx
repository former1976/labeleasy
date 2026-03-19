"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MaterialSelector, { type Material, MATERIALS } from "./MaterialSelector";
import ShapeSelector, { type Shape } from "./ShapeSelector";
import EditorSidebar from "./EditorSidebar";
import FileUpload from "./FileUpload";

interface LabelEditorProps {
  fileData: { name: string; type: string; preview: string };
}

function calculatePrice(w: number, h: number, qty: number, mat: Material, lam: "glossy" | "mat") {
  let base = w * h * 0.12;
  if (qty >= 1000) base *= 0.45;
  else if (qty >= 500) base *= 0.55;
  else if (qty >= 250) base *= 0.65;
  else if (qty >= 100) base *= 0.75;
  else if (qty >= 50) base *= 0.85;
  else if (qty >= 25) base *= 0.92;
  const matM = MATERIALS.find((m) => m.id === mat)?.priceMultiplier ?? 1;
  const lamM = lam === "glossy" ? 1.1 : 1.05;
  return Math.ceil(Math.max(base * matM * lamM, 0.5) * qty);
}

function getShapeRadius(shape: Shape): string {
  if (shape === "circle" || shape === "oval") return "50%";
  if (shape === "rounded") return "12%";
  return "3px";
}

// Boundary tracing (Moore neighborhood)
function traceBoundary(dilated: Uint8Array, w: number, h: number): { x: number; y: number }[] {
  let sx = -1, sy = -1;
  for (let y = 0; y < h && sx === -1; y++)
    for (let x = 0; x < w; x++)
      if (dilated[y * w + x]) { sx = x; sy = y; break; }
  if (sx === -1) return [];

  const DX = [1, 1, 0, -1, -1, -1, 0, 1];
  const DY = [0, 1, 1, 1, 0, -1, -1, -1];
  const raw: { x: number; y: number }[] = [{ x: sx, y: sy }];
  let cx = sx, cy = sy, prevDir = 6;

  for (let iter = 0; iter < w * h; iter++) {
    let moved = false;
    for (let d = 0; d < 8; d++) {
      const dir = (prevDir + 5 + d) % 8;
      const nx = cx + DX[dir], ny = cy + DY[dir];
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && dilated[ny * w + nx]) {
        cx = nx; cy = ny; prevDir = dir;
        if (cx === sx && cy === sy && raw.length > 4) { moved = true; break; }
        raw.push({ x: cx, y: cy });
        moved = true;
        break;
      }
    }
    if (!moved || (cx === sx && cy === sy && raw.length > 4)) break;
  }

  const step = Math.max(1, Math.floor(raw.length / 180));
  return raw.filter((_, i) => i % step === 0);
}

interface ContourResult {
  visualUrl: string;
  maskUrl: string; // solid filled mask for CSS mask-image
  points: { x: number; y: number }[]; // normalized 0–1 (canvas coords, y-down)
}

// Render image with pan/zoom transform applied to a canvas (for PDF export)
async function renderTransformedImage(
  src: string,
  canvasW: number,
  canvasH: number,
  paddingFraction: number,
  offset: { x: number; y: number },
  scale: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext("2d")!;

      // object-contain fit within full canvas (generatePrintPDF adds its own padding)
      const imgAr = img.naturalWidth / img.naturalHeight;
      const areaAr = canvasW / canvasH;
      const fitW = imgAr > areaAr ? canvasW : canvasH * imgAr;
      const fitH = imgAr > areaAr ? canvasW / imgAr : canvasH;

      // CSS translate % is relative to the padded area in the UI
      const areaW = canvasW * (1 - 2 * paddingFraction);
      const areaH = canvasH * (1 - 2 * paddingFraction);
      const tx = (offset.x / 100) * areaW;
      const ty = (offset.y / 100) * areaH;

      ctx.save();
      ctx.translate(canvasW / 2 + tx, canvasH / 2 + ty);
      ctx.scale(scale, scale);
      ctx.drawImage(img, -fitW / 2, -fitH / 2, fitW, fitH);
      ctx.restore();

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = src;
  });
}

async function generateDieCutContour(src: string, aspect: number): Promise<ContourResult> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 400;
      const cw = aspect >= 1 ? MAX : Math.round(MAX * aspect);
      const ch = aspect >= 1 ? Math.round(MAX / aspect) : MAX;

      const canvas = document.createElement("canvas");
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, cw, ch);

      const pad = 0.04;
      const iW = cw * (1 - 2 * pad), iH = ch * (1 - 2 * pad);
      const ar = img.naturalWidth / img.naturalHeight;
      const cAr = iW / iH;
      const dw = ar > cAr ? iW : iH * ar;
      const dh = ar > cAr ? iW / ar : iH;
      ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);

      const { data } = ctx.getImageData(0, 0, cw, ch);
      const mask = new Uint8Array(cw * ch);
      for (let i = 0; i < cw * ch; i++) {
        const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
        if (a < 20 || (r > 235 && g > 235 && b > 235)) continue;
        mask[i] = 1;
      }

      const R = Math.max(5, Math.round(Math.min(cw, ch) * 0.038));
      const hd = new Uint8Array(cw * ch);
      for (let y = 0; y < ch; y++)
        for (let x = 0; x < cw; x++)
          if (mask[y * cw + x])
            for (let dx = Math.max(0, x - R); dx <= Math.min(cw - 1, x + R); dx++)
              hd[y * cw + dx] = 1;

      const dilated = new Uint8Array(cw * ch);
      for (let x = 0; x < cw; x++)
        for (let y = 0; y < ch; y++)
          if (hd[y * cw + x])
            for (let dy = Math.max(0, y - R); dy <= Math.min(ch - 1, y + R); dy++)
              dilated[dy * cw + x] = 1;

      // Extract ordered polygon
      const polygon = traceBoundary(dilated, cw, ch);
      const points = polygon.map((p) => ({ x: p.x / cw, y: p.y / ch }));

      // Render pink visual contour
      const outData = new ImageData(cw, ch);
      for (let y = 1; y < ch - 1; y++)
        for (let x = 1; x < cw - 1; x++) {
          if (!dilated[y * cw + x]) continue;
          if (!dilated[(y-1)*cw+x] || !dilated[(y+1)*cw+x] ||
              !dilated[y*cw+x-1] || !dilated[y*cw+x+1] ||
              !dilated[(y-1)*cw+x-1] || !dilated[(y-1)*cw+x+1] ||
              !dilated[(y+1)*cw+x-1] || !dilated[(y+1)*cw+x+1]) {
            const i = (y * cw + x) * 4;
            outData.data[i] = 232; outData.data[i+1] = 20; outData.data[i+2] = 160; outData.data[i+3] = 220;
          }
        }
      ctx.putImageData(outData, 0, 0);
      const visualUrl = canvas.toDataURL();

      // Solid filled mask canvas (white = visible, transparent = hidden)
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = cw; maskCanvas.height = ch;
      const mctx = maskCanvas.getContext("2d")!;
      const maskData = new ImageData(cw, ch);
      for (let i = 0; i < cw * ch; i++) {
        if (dilated[i]) {
          maskData.data[i * 4] = 255;
          maskData.data[i * 4 + 1] = 255;
          maskData.data[i * 4 + 2] = 255;
          maskData.data[i * 4 + 3] = 255;
        }
      }
      mctx.putImageData(maskData, 0, 0);
      const maskUrl = maskCanvas.toDataURL();

      resolve({ visualUrl, maskUrl, points });
    };
    img.src = src;
  });
}

export default function LabelEditor({ fileData }: LabelEditorProps) {
  const router = useRouter();
  const canvasRef = useRef<HTMLDivElement>(null);
  const stickerSizeRef = useRef({ w: 0, h: 0 });

  const [shape, setShape] = useState<Shape>("rounded");
  const [material, setMaterial] = useState<Material>("vinyl");
  const [width, setWidth] = useState(10);
  const [height, setHeight] = useState(10);
  const [quantity, setQuantity] = useState(50);
  const [laminate, setLaminate] = useState<"glossy" | "mat">("glossy");
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragStartRotation, setDragStartRotation] = useState(0);
  const [pdfPageUrl, setPdfPageUrl] = useState<string | null>(null);
  const [showUploadOverlay, setShowUploadOverlay] = useState(false);
  const [canvasBg, setCanvasBg] = useState<"light" | "dark" | "checker">("light");
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [contourUrl, setContourUrl] = useState<string | null>(null);
  const [maskUrl, setMaskUrl] = useState<string | null>(null);
  const [contourPoints, setContourPoints] = useState<{ x: number; y: number }[]>([]);
  const [contourLoading, setContourLoading] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [imageEditMode, setImageEditMode] = useState(false);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 }); // percent
  const [imageScale, setImageScale] = useState(1);
  const [imagePanStart, setImagePanStart] = useState<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const isPdf = fileData.type === "application/pdf";
  const previewSrc = isPdf && pdfPageUrl ? pdfPageUrl : fileData.preview;

  useEffect(() => {
    if (!isPdf) return;
    let cancelled = false;
    async function renderPdf() {
      try {
        const lib = await import("pdfjs-dist");
        lib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${lib.version}/build/pdf.worker.min.mjs`;
        const pdf = await lib.getDocument(fileData.preview).promise;
        const page = await pdf.getPage(1);
        const vp = page.getViewport({ scale: 2 });
        const c = document.createElement("canvas");
        c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext("2d")!, viewport: vp, canvas: c }).promise;
        if (!cancelled) setPdfPageUrl(c.toDataURL());
      } catch (e) { console.error(e); }
    }
    renderPdf();
    return () => { cancelled = true; };
  }, [isPdf, fileData.preview]);

  useEffect(() => {
    if (shape !== "diecut" || !previewSrc) {
      setContourUrl(null); setMaskUrl(null); setContourPoints([]);
      return;
    }
    setContourLoading(true);
    generateDieCutContour(previewSrc, width / height).then(({ visualUrl, maskUrl: mUrl, points }) => {
      setContourUrl(visualUrl);
      setMaskUrl(mUrl);
      setContourPoints(points);
      setContourLoading(false);
    });
  }, [shape, previewSrc, width, height]);

  const price = calculatePrice(width, height, quantity, material, laminate);
  const shapeRadius = getShapeRadius(shape);

  // Mouse tilt
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging || imageEditMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const ny = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    setTilt({ x: ny * -14, y: nx * 14 });
  }, [isDragging, imageEditMode]);
  const handleCanvasMouseLeave = useCallback(() => setTilt({ x: 0, y: 0 }), []);

  // Drag to rotate / pan image
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (imageEditMode) {
      setImagePanStart({ x: e.clientX, y: e.clientY, ox: imageOffset.x, oy: imageOffset.y });
    } else {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setDragStartRotation(rotation);
      setTilt({ x: 0, y: 0 });
    }
  }, [rotation, imageEditMode, imageOffset]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (imagePanStart) {
      const dx = e.clientX - imagePanStart.x;
      const dy = e.clientY - imagePanStart.y;
      setImageOffset({
        x: imagePanStart.ox + (dx / stickerSizeRef.current.w) * 100,
        y: imagePanStart.oy + (dy / stickerSizeRef.current.h) * 100,
      });
    } else if (isDragging && dragStart) {
      setRotation(Math.max(-180, Math.min(180, Math.round(dragStartRotation + (e.clientX - dragStart.x) * 0.5))));
    }
  }, [imagePanStart, isDragging, dragStart, dragStartRotation]);

  const handleMouseUp = useCallback(() => { setIsDragging(false); setDragStart(null); setImagePanStart(null); }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
  }, [handleMouseMove, handleMouseUp]);

  const touchRef = useRef<{ x: number; rot: number } | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (imageEditMode) {
      const t = e.touches[0];
      setImagePanStart({ x: t.clientX, y: t.clientY, ox: imageOffset.x, oy: imageOffset.y });
    } else {
      touchRef.current = { x: e.touches[0].clientX, rot: rotation };
    }
  }, [rotation, imageEditMode, imageOffset]);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (imageEditMode && imagePanStart) {
      const t = e.touches[0];
      setImageOffset({
        x: imagePanStart.ox + ((t.clientX - imagePanStart.x) / stickerSizeRef.current.w) * 100,
        y: imagePanStart.oy + ((t.clientY - imagePanStart.y) / stickerSizeRef.current.h) * 100,
      });
    } else if (touchRef.current) {
      setRotation(Math.max(-180, Math.min(180, Math.round(touchRef.current.rot + (e.touches[0].clientX - touchRef.current.x) * 0.5))));
    }
  }, [imageEditMode, imagePanStart]);
  const handleTouchEnd = useCallback(() => { setImagePanStart(null); }, []);

  const getMaterialOverlay = (): React.CSSProperties => {
    if (material === "holografisk") return { background: "linear-gradient(135deg,rgba(255,0,128,.35),rgba(255,140,0,.35),rgba(64,224,208,.35),rgba(123,47,190,.35))", backgroundSize: "400% 400%", mixBlendMode: "color" as const };
    if (material === "gennemsigtig") return { background: "rgba(255,255,255,.08)", backdropFilter: "blur(1px)" };
    if (material === "glitter") return { background: "linear-gradient(45deg,rgba(255,215,0,.4) 25%,rgba(255,250,205,.5) 50%,rgba(255,215,0,.4) 75%)", backgroundSize: "200% 200%", mixBlendMode: "overlay" as const };
    return {};
  };

  const getLaminateStyle = (): React.CSSProperties =>
    laminate === "glossy"
      ? { background: "linear-gradient(135deg,rgba(255,255,255,.25) 0%,transparent 50%,rgba(255,255,255,.1) 100%)" }
      : { background: "rgba(200,200,200,.05)", backdropFilter: "blur(.5px)" };

  const getCanvasStyle = (): React.CSSProperties => {
    if (canvasBg === "dark") return { backgroundColor: "#2a2a2a" };
    if (canvasBg === "checker") return { backgroundImage: "linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)", backgroundSize: "16px 16px", backgroundPosition: "0 0,0 8px,8px -8px,-8px 0", backgroundColor: "#e8e8e8" };
    return { backgroundColor: "#f4f4f4" };
  };

  const handleNewFile = useCallback((file: File, url: string) => {
    sessionStorage.setItem("labelFile_name", file.name);
    sessionStorage.setItem("labelFile_type", file.type);
    sessionStorage.setItem("labelFile_preview", url);
    window.location.reload();
  }, []);

  const handleDownloadPDF = async () => {
    if (!previewSrc) return;
    setPdfGenerating(true);
    try {
      const { generatePrintPDF } = await import("@/lib/generatePDF");
      const hasTransform = imageOffset.x !== 0 || imageOffset.y !== 0 || imageScale !== 1;
      let sourceDataUrl: string;
      if (isPdf && !hasTransform) {
        // Original PDF, no transform — preserve vector quality
        sourceDataUrl = fileData.preview;
      } else if (hasTransform) {
        // Pre-render with pan/zoom transform at high resolution
        const LONG = 2000;
        const aspect = height / width;
        const cW = aspect >= 1 ? Math.round(LONG / aspect) : LONG;
        const cH = aspect >= 1 ? LONG : Math.round(LONG * aspect);
        const padding = shape === "diecut" ? 0.02 : 0.04;
        const rasterSrc = isPdf && pdfPageUrl ? pdfPageUrl : previewSrc;
        sourceDataUrl = await renderTransformedImage(rasterSrc, cW, cH, padding, imageOffset, imageScale);
      } else {
        sourceDataUrl = previewSrc;
      }
      const bytes = await generatePrintPDF({
        imageDataUrl: sourceDataUrl,
        widthCm: width,
        heightCm: height,
        shape,
        diecuPoints: shape === "diecut" ? contourPoints : undefined,
      });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `labeleasy-${fileData.name.replace(/\.[^.]+$/, "")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Fejl ved PDF-generering. Prøv igen.");
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleAddToCart = () => alert(`✅ Lagt i kurv!\n\n${quantity} stk ${material} (${shape})\n${width}×${height} cm • ${laminate}\nTotal: ${price} kr`);

  const baseSize = Math.min(380, Math.max(120, width * 25));
  const stickerW = baseSize * zoom;
  const stickerH = baseSize * (height / width) * zoom;
  stickerSizeRef.current = { w: stickerW, h: stickerH };

  return (
    <div className="h-screen bg-[#1a1a1a] flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="h-14 bg-[#111] border-b border-white/10 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="text-white/50 hover:text-white text-sm flex items-center gap-1.5 transition-colors">
            <span>←</span><span>Tilbage</span>
          </button>
          <div className="w-px h-5 bg-white/10" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#FFD700] flex items-center justify-center">
              <span className="text-black font-bold text-xs">L</span>
            </div>
            <span className="text-white font-semibold text-sm">Label<span className="text-[#FFD700]">Easy</span></span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 max-w-xs">
          <span className="text-lg">{isPdf ? "📄" : "🖼️"}</span>
          <span className="text-white/70 text-sm truncate">{fileData.name}</span>
          <button onClick={() => setShowUploadOverlay(true)} className="text-white/30 hover:text-[#FFD700] text-xs ml-1 transition-colors" title="Skift fil">✎</button>
        </div>

        <div className="flex items-center gap-3">
          {/* Canvas bg */}
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
            {(["light", "dark", "checker"] as const).map((bg) => (
              <button key={bg} onClick={() => setCanvasBg(bg)}
                className={`w-6 h-6 rounded transition-all ${canvasBg === bg ? "ring-2 ring-[#FFD700]" : "opacity-60 hover:opacity-100"}`}
                style={{ background: bg === "light" ? "#f4f4f4" : bg === "dark" ? "#2a2a2a" : "repeating-conic-gradient(#ccc 0% 25%,#e8e8e8 0% 50%) 0 0/10px 10px" }}
              />
            ))}
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-2">
            <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm transition-colors">−</button>
            <span className="text-white/50 text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(3, z + 0.1))} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm transition-colors">+</button>
            <button onClick={() => { setZoom(1); setRotation(0); }} className="text-white/30 hover:text-white text-xs px-2 py-1 rounded transition-colors">Nulstil</button>
          </div>

          {/* PDF download */}
          <button
            onClick={handleDownloadPDF}
            disabled={pdfGenerating}
            className="flex items-center gap-2 bg-[#FFD700] hover:bg-[#FFC200] disabled:opacity-60 disabled:cursor-wait text-black font-bold text-sm px-4 py-2 rounded-xl transition-colors shadow-md shadow-[#FFD700]/20"
          >
            {pdfGenerating ? (
              <><div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />Genererer...</>
            ) : (
              <><span>⬇</span> Download PDF</>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="w-56 bg-[#111] border-r border-white/10 p-4 flex-shrink-0 overflow-y-auto flex flex-col gap-6">
          <ShapeSelector selected={shape} onChange={setShape} />
          <div className="border-t border-white/10" />
          <MaterialSelector selected={material} onChange={setMaterial} />
          <div className="mt-auto pt-4 border-t border-white/10">
            <p className="text-white/30 text-xs leading-relaxed">💡 Træk for at rotere • Scroll for at zoome</p>
          </div>
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 flex items-center justify-center relative overflow-hidden transition-colors duration-300"
          style={{ ...getCanvasStyle(), perspective: "800px" }}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={handleCanvasMouseLeave}
          onWheel={(e) => {
            e.preventDefault();
            if (imageEditMode) {
              setImageScale((s) => Math.max(0.5, Math.min(5, s + (e.deltaY > 0 ? -0.05 : 0.05))));
            } else {
              setZoom((z) => Math.max(0.3, Math.min(3, z + (e.deltaY > 0 ? -0.05 : 0.05))));
            }
          }}
        >
          {/* Dot grid */}
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle,rgba(0,0,0,0.1) 1px,transparent 1px)", backgroundSize: "24px 24px" }} />

          {/* Ruler labels */}
          <div className="absolute text-sm font-medium text-gray-400 pointer-events-none select-none"
            style={{ top: "50%", left: "20px", transform: `translateY(calc(-50% - ${stickerH / 2}px)) rotate(-90deg)`, whiteSpace: "nowrap" }}>
            {height} cm
          </div>
          <div className="absolute text-sm font-medium text-gray-400 pointer-events-none select-none"
            style={{ bottom: `calc(50% - ${stickerH / 2}px - 24px)`, left: "50%", transform: "translateX(-50%)" }}>
            {width} cm
          </div>

          {/* Sticker */}
          <div
            style={{
              width: stickerW, height: stickerH,
              transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) rotate(${rotation}deg)`,
              transition: isDragging ? "none" : "transform 0.12s ease-out",
              transformStyle: "preserve-3d",
              position: "relative", userSelect: "none",
              cursor: imageEditMode ? (imagePanStart ? "grabbing" : "move") : (isDragging ? "grabbing" : "grab"),
              filter: "drop-shadow(0 14px 36px rgba(0,0,0,0.22)) drop-shadow(0 3px 8px rgba(0,0,0,0.14))",
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Die-cut contour overlay (pink line — shown OUTSIDE clip) */}
            {shape === "diecut" && contourUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={contourUrl} alt="" className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 20, objectFit: "fill" }} draggable={false} />
            )}
            {shape === "diecut" && contourLoading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 20 }}>
                <div className="w-5 h-5 border-2 border-pink-500/50 border-t-pink-500 rounded-full animate-spin" />
              </div>
            )}

            {/* Clipped sticker content */}
            <div className="absolute inset-0" style={
              shape === "diecut" && maskUrl
                ? { WebkitMaskImage: `url(${maskUrl})`, maskImage: `url(${maskUrl})`, WebkitMaskSize: "100% 100%", maskSize: "100% 100%" }
                : { overflow: "hidden" }
            }>
              {/* White backing */}
              <div className="absolute inset-0 bg-white" style={{ borderRadius: shape !== "diecut" ? shapeRadius : undefined }} />

              {/* Artwork */}
              {previewSrc ? (
                <div
                  className="absolute inset-0"
                  style={{ padding: shape === "diecut" ? "2%" : "4%", pointerEvents: "none", overflow: "hidden" }}
                >
                  <div
                    className="relative w-full h-full"
                    style={{
                      transform: `translate(${imageOffset.x}%, ${imageOffset.y}%) scale(${imageScale})`,
                      transformOrigin: "center center",
                      transition: imagePanStart ? "none" : "transform 0.05s ease-out",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewSrc} alt="Label preview" className="absolute inset-0 w-full h-full object-contain"
                      style={{ filter: material === "gennemsigtig" ? "opacity(.9)" : "none", borderRadius: shape !== "diecut" ? shapeRadius : undefined }}
                      draggable={false} />
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm">Indlæser...</div>
              )}

              {/* Image edit mode ring */}
              {imageEditMode && (
                <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: "inset 0 0 0 2px rgba(96,165,250,0.8)", borderRadius: shape !== "diecut" ? shapeRadius : undefined, zIndex: 25 }} />
              )}

              {/* Material overlay */}
              {material !== "vinyl" && (
                <div className="absolute inset-0" style={{ ...getMaterialOverlay(), borderRadius: shape !== "diecut" ? shapeRadius : undefined, pointerEvents: "none" }} />
              )}

              {/* Laminate sheen */}
              <div className="absolute inset-0" style={{ ...getLaminateStyle(), borderRadius: shape !== "diecut" ? shapeRadius : undefined, pointerEvents: "none" }} />

              {material === "holografisk" && (
                <div className="absolute inset-0 holographic-effect opacity-30" style={{ borderRadius: shape !== "diecut" ? shapeRadius : undefined, pointerEvents: "none", mixBlendMode: "color" }} />
              )}
              {material === "glitter" && (
                <div className="absolute inset-0 glitter-effect opacity-25" style={{ borderRadius: shape !== "diecut" ? shapeRadius : undefined, pointerEvents: "none", mixBlendMode: "overlay" }} />
              )}
            </div>
          </div>

          {/* Floating image edit toolbar */}
          <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-2">
            {!imageEditMode ? (
              <button
                onClick={() => setImageEditMode(true)}
                className="flex items-center gap-1.5 bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-white/15 text-white/80 hover:text-white text-xs px-3 py-1.5 rounded-full transition-all"
              >
                ✏️ Rediger billede
              </button>
            ) : (
              <>
                <div className="bg-blue-500/20 border border-blue-400/40 text-blue-300 text-xs px-3 py-1.5 rounded-full backdrop-blur-sm">
                  Træk for at flytte • Scroll for at zoome
                </div>
                <button
                  onClick={() => { setImageOffset({ x: 0, y: 0 }); setImageScale(1); }}
                  className="bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-white/15 text-white/60 hover:text-white text-xs px-3 py-1.5 rounded-full transition-all"
                >
                  Nulstil
                </button>
                <button
                  onClick={() => setImageEditMode(false)}
                  className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-full transition-all"
                >
                  ✓ Færdig
                </button>
              </>
            )}
          </div>

          {/* Status bar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <div className="bg-black/40 text-white/60 text-xs px-3 py-1.5 rounded-full backdrop-blur-sm">
              {width} × {height} cm • {quantity} stk • {price} kr
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-72 bg-[#111] border-l border-white/10 p-4 flex-shrink-0">
          <EditorSidebar
            width={width} height={height} quantity={quantity} laminate={laminate}
            rotation={rotation} onWidthChange={setWidth} onHeightChange={setHeight}
            onQuantityChange={setQuantity} onLaminateChange={setLaminate}
            onRotationChange={setRotation} material={material} shape={shape}
            price={price} onAddToCart={handleAddToCart}
          />
        </div>
      </div>

      {showUploadOverlay && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm" onClick={() => setShowUploadOverlay(false)}>
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-8 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-white font-bold text-lg">Upload nyt design</h2>
              <button onClick={() => setShowUploadOverlay(false)} className="text-white/40 hover:text-white text-xl transition-colors">×</button>
            </div>
            <FileUpload onFileAccepted={(f, u) => { setShowUploadOverlay(false); handleNewFile(f, u); }} isDraggingOver={false} setIsDraggingOver={() => {}} />
          </div>
        </div>
      )}
    </div>
  );
}
