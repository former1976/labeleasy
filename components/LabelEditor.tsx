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

// ── Color effect utilities ────────────────────────────────────────────────────
type HexColor = string;
type ColorEffect = "ingen" | "farve" | "fuld";

function rgbToHex(r: number, g: number, b: number): HexColor {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function extractDominantColors(src: string, count: number): Promise<HexColor[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 200;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);

      // Bucket into 16-level bins, skip near-white (background) and transparent
      const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 128 || (r > 240 && g > 240 && b > 240)) continue;
        const key = `${r >> 4},${g >> 4},${b >> 4}`;
        const e = buckets.get(key);
        if (e) { e.count++; e.r += r; e.g += g; e.b += b; }
        else buckets.set(key, { count: 1, r, g, b });
      }

      const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);
      const result: HexColor[] = [];
      for (const bucket of sorted) {
        if (result.length >= count) break;
        const r = Math.round(bucket.r / bucket.count);
        const g = Math.round(bucket.g / bucket.count);
        const b = Math.round(bucket.b / bucket.count);
        const tooClose = result.some((hex) =>
          colorDist(r, g, b, parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)) < 45
        );
        if (!tooClose) result.push(rgbToHex(r, g, b));
      }
      // Always include white as the first color (white underprint control)
      resolve(["#ffffff", ...result].slice(0, count));
    };
    img.src = src;
  });
}

function applyColorEffects(
  src: string,
  dominantColors: HexColor[],
  effects: Record<HexColor, ColorEffect>
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, img.width, img.height);
      const d = id.data;

      const parsed = dominantColors.map((hex) => ({
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16),
        effect: effects[hex] ?? "ingen",
      }));

      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 64) continue;
        let minDist = Infinity, nearestEffect: ColorEffect = "ingen";
        for (const c of parsed) {
          const dist = colorDist(d[i], d[i + 1], d[i + 2], c.r, c.g, c.b);
          if (dist < minDist) { minDist = dist; nearestEffect = c.effect; }
        }
        if (nearestEffect === "fuld") d[i + 3] = 0;
        else if (nearestEffect === "farve") d[i + 3] = Math.round(d[i + 3] * 0.4);
      }
      ctx.putImageData(id, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = src;
  });
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

      // White backing (matches editor white backing)
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvasW, canvasH);

      // object-contain fit within PADDED area (matches CSS in the editor exactly)
      const padX = canvasW * paddingFraction;
      const padY = canvasH * paddingFraction;
      const areaW = canvasW - 2 * padX;
      const areaH = canvasH - 2 * padY;
      const imgAr = img.naturalWidth / img.naturalHeight;
      const areaAr = areaW / areaH;
      const fitW = imgAr > areaAr ? areaW : areaH * imgAr;
      const fitH = imgAr > areaAr ? areaW / imgAr : areaH;

      // Transform origin = center of padded area; translate % relative to padded area
      const tx = (offset.x / 100) * areaW;
      const ty = (offset.y / 100) * areaH;

      ctx.save();
      ctx.translate(padX + areaW / 2 + tx, padY + areaH / 2 + ty);
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
  const [whiteUnderprint, setWhiteUnderprint] = useState(true);
  const [dominantColors, setDominantColors] = useState<HexColor[]>([]);
  const [colorEffects, setColorEffects] = useState<Record<HexColor, ColorEffect>>({});
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);
  const [openColorPicker, setOpenColorPicker] = useState<HexColor | null>(null);

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

  // Extract dominant colors when gennemsigtig material is selected
  useEffect(() => {
    if (material !== "gennemsigtig" || !previewSrc) {
      setDominantColors([]); setColorEffects({}); setProcessedImageUrl(null);
      return;
    }
    extractDominantColors(previewSrc, 6).then(setDominantColors);
  }, [material, previewSrc]);

  // Re-process image whenever color effects change
  useEffect(() => {
    if (!previewSrc || dominantColors.length === 0) return;
    const hasEffects = Object.values(colorEffects).some((e) => e !== "ingen");
    if (!hasEffects) { setProcessedImageUrl(null); return; }
    applyColorEffects(previewSrc, dominantColors, colorEffects).then(setProcessedImageUrl);
  }, [previewSrc, dominantColors, colorEffects]);

  const toggleColorEffect = useCallback((hex: HexColor) => {
    setColorEffects((prev) => {
      const cur = prev[hex] ?? "ingen";
      const next: ColorEffect = cur === "ingen" ? "farve" : cur === "farve" ? "fuld" : "ingen";
      return { ...prev, [hex]: next };
    });
  }, []);

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
    if (material === "gennemsigtig") return whiteUnderprint ? {} : { background: "rgba(255,255,255,.12)" };
    if (material === "glitter") return { background: "linear-gradient(45deg,rgba(255,215,0,.4) 25%,rgba(255,250,205,.5) 50%,rgba(255,215,0,.4) 75%)", backgroundSize: "200% 200%", mixBlendMode: "overlay" as const };
    if (material === "sølv") return { background: "linear-gradient(145deg,rgba(255,255,255,.85) 0%,rgba(190,190,190,.12) 15%,rgba(255,255,255,.7) 30%,rgba(150,150,150,.12) 45%,rgba(255,255,255,.75) 60%,rgba(175,175,175,.1) 75%,rgba(255,255,255,.6) 90%,rgba(155,155,155,.18) 100%)", mixBlendMode: "overlay" as const };
    if (material === "kraftpapir") return { background: "rgba(160,100,40,.18)", mixBlendMode: "multiply" as const };
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
      // Always pre-render raster images so PDF exactly matches the preview.
      // PDF uploads without transform keep vector quality via original data.
      const hasTransform = imageOffset.x !== 0 || imageOffset.y !== 0 || imageScale !== 1;
      let sourceDataUrl: string;
      let imagePadding: number | undefined;
      if (isPdf && !hasTransform) {
        sourceDataUrl = fileData.preview; // vector PDF, no transform — preserve quality
        imagePadding = undefined;
      } else {
        // Pre-render: bakes white backing + padding + transform into canvas image
        const LONG = 2000;
        const aspect = height / width;
        const cW = aspect >= 1 ? Math.round(LONG / aspect) : LONG;
        const cH = aspect >= 1 ? LONG : Math.round(LONG * aspect);
        const padding = shape === "diecut" ? 0.02 : 0.04;
        const rasterSrc = processedImageUrl ?? (isPdf && pdfPageUrl ? pdfPageUrl : previewSrc);
        sourceDataUrl = await renderTransformedImage(rasterSrc, cW, cH, padding, imageOffset, imageScale);
        imagePadding = 0; // padding is baked in — don't add another white ring in PDF
      }
      const bytes = await generatePrintPDF({
        imageDataUrl: sourceDataUrl,
        widthCm: width,
        heightCm: height,
        imagePadding,
        shape,
        diecuPoints: shape === "diecut" ? contourPoints : undefined,
        whiteUnderprint: material === "gennemsigtig" && whiteUnderprint,
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
              {/* White backing — checker when transparent effects are active or underprint is off */}
              <div
                className="absolute inset-0"
                style={{
                  borderRadius: shape !== "diecut" ? shapeRadius : undefined,
                  ...(
                    ((material === "gennemsigtig" || material === "holografisk") && !whiteUnderprint) ||
                    (processedImageUrl !== null && !(material === "gennemsigtig" && whiteUnderprint))
                      ? {
                          backgroundImage: "linear-gradient(45deg,#bbb 25%,transparent 25%),linear-gradient(-45deg,#bbb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#bbb 75%),linear-gradient(-45deg,transparent 75%,#bbb 75%)",
                          backgroundSize: "10px 10px",
                          backgroundPosition: "0 0,0 5px,5px -5px,-5px 0",
                          backgroundColor: "#e4e4e4",
                        }
                      : { backgroundColor: "white" }
                  ),
                }}
              />

              {/* Artwork */}
              {previewSrc ? (
                <div
                  className="absolute inset-0"
                  style={{ padding: shape === "diecut" ? "2%" : "4%", pointerEvents: "none", overflow: "hidden", borderRadius: shape !== "diecut" ? shapeRadius : undefined }}
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
                    <img src={processedImageUrl ?? previewSrc} alt="Label preview" className="absolute inset-0 w-full h-full object-contain"
                      style={{ filter: (material === "gennemsigtig" && !whiteUnderprint && !processedImageUrl) ? "opacity(0.7)" : "none", borderRadius: shape !== "diecut" ? shapeRadius : undefined }}
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
              {material === "sølv" && (
                <>
                  {/* Brushed metal lines */}
                  <div className="absolute inset-0 opacity-45" style={{ borderRadius: shape !== "diecut" ? shapeRadius : undefined, pointerEvents: "none", mixBlendMode: "screen", backgroundImage: "repeating-linear-gradient(97deg, transparent 0px, transparent 1px, rgba(255,255,255,0.9) 1px, rgba(255,255,255,0.9) 1.5px, transparent 1.5px, transparent 4px)" }} />
                  {/* Edge darkening for depth */}
                  <div className="absolute inset-0 opacity-30" style={{ borderRadius: shape !== "diecut" ? shapeRadius : undefined, pointerEvents: "none", mixBlendMode: "multiply", background: "radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(80,80,80,0.6) 100%)" }} />
                </>
              )}
              {material === "gennemsigtig" && !whiteUnderprint && !processedImageUrl && (
                /* Glass specular highlight — only without color effects and no white underprint */
                <div className="absolute inset-0 pointer-events-none" style={{ borderRadius: shape !== "diecut" ? shapeRadius : undefined, background: "linear-gradient(135deg, rgba(255,255,255,0.45) 0%, transparent 45%, rgba(255,255,255,0.12) 100%)" }} />
              )}
              {material === "kraftpapir" && (
                <div className="absolute inset-0 opacity-30" style={{ borderRadius: shape !== "diecut" ? shapeRadius : undefined, pointerEvents: "none", mixBlendMode: "multiply", background: "radial-gradient(ellipse at 60% 40%, rgba(180,110,40,.4) 0%, transparent 70%)" }} />
              )}
            </div>
          </div>

          {/* Floating image edit toolbar */}
          <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-2">
            {(material === "gennemsigtig" || material === "holografisk") && !imageEditMode && (
              <button
                onClick={() => setWhiteUnderprint((v) => !v)}
                className={`flex items-center gap-1.5 backdrop-blur-sm border text-xs px-3 py-1.5 rounded-full transition-all ${
                  whiteUnderprint
                    ? "bg-white/20 border-white/40 text-white"
                    : "bg-black/60 border-white/15 text-white/60"
                }`}
              >
                {whiteUnderprint ? "⬜ Hvid underprint: TIL" : "◻️ Hvid underprint: FRA"}
              </button>
            )}
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

          {/* Color effect panel — popover style */}
          {material === "gennemsigtig" && dominantColors.length > 0 && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-2">
              {dominantColors.map((hex) => {
                const effect = colorEffects[hex] ?? "ingen";
                const isOpen = openColorPicker === hex;
                const isWhite = hex === "#ffffff";
                const checkerBg = "linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)";
                return (
                  <div key={hex} className="relative">
                    {/* Popover */}
                    {isOpen && (
                      <>
                        {/* Backdrop */}
                        <div className="fixed inset-0 z-40" onClick={() => setOpenColorPicker(null)} />
                        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 bg-white rounded-2xl shadow-2xl overflow-hidden w-52" style={{ border: "1px solid rgba(0,0,0,0.08)" }}>
                          {(["ingen", "farve", "fuld"] as ColorEffect[]).map((opt, i) => (
                            <button
                              key={opt}
                              onClick={() => { setColorEffects((p) => ({ ...p, [hex]: opt })); setOpenColorPicker(null); }}
                              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${i > 0 ? "border-t border-gray-100" : ""}`}
                            >
                              {/* Color preview in this state */}
                              <div className="w-10 h-10 rounded-full flex-shrink-0 shadow-sm overflow-hidden" style={{
                                backgroundImage: isWhite || opt === "fuld" ? checkerBg : undefined,
                                backgroundSize: "8px 8px",
                                backgroundPosition: "0 0,0 4px,4px -4px,-4px 0",
                                backgroundColor: isWhite ? "#fff" : "#e4e4e4",
                              }}>
                                <div className="w-full h-full rounded-full" style={{
                                  backgroundColor: hex,
                                  opacity: opt === "ingen" ? 1 : opt === "farve" ? 0.45 : 0,
                                }} />
                              </div>
                              <span className={`text-sm text-gray-800 ${effect === opt ? "font-bold" : "font-normal"}`}>
                                {opt === "ingen" ? "Ingen effekt" : opt === "farve" ? "Farveeffekt" : "Fuld effekt"}
                              </span>
                            </button>
                          ))}
                          {/* Popover arrow */}
                          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45 border-b border-r border-gray-100" />
                        </div>
                      </>
                    )}
                    {/* Swatch button */}
                    <button
                      onClick={() => setOpenColorPicker(isOpen ? null : hex)}
                      className="relative w-9 h-9 rounded-full transition-transform hover:scale-110 active:scale-95"
                      style={{
                        backgroundImage: isWhite ? checkerBg : undefined,
                        backgroundSize: isWhite ? "8px 8px" : undefined,
                        backgroundPosition: isWhite ? "0 0,0 4px,4px -4px,-4px 0" : undefined,
                        backgroundColor: isWhite ? "#e4e4e4" : hex,
                        outline: isOpen ? "3px solid white" : effect !== "ingen" ? "3px solid rgba(255,255,255,0.7)" : "2px solid rgba(255,255,255,0.2)",
                        outlineOffset: "2px",
                        opacity: effect === "fuld" ? 0.35 : effect === "farve" ? 0.6 : 1,
                        boxShadow: effect === "ingen"
                          ? `0 2px 8px ${hex}99, 0 1px 3px rgba(0,0,0,0.3)`
                          : "0 1px 4px rgba(0,0,0,0.25)",
                      }}
                    >
                      {/* Gloss highlight */}
                      {effect === "ingen" && (
                        <div className="absolute inset-0 rounded-full pointer-events-none" style={{
                          background: "linear-gradient(145deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.1) 40%, transparent 60%)",
                        }} />
                      )}
                      {isWhite && <div className="w-full h-full rounded-full" style={{ backgroundColor: "#fff", opacity: effect === "ingen" ? 1 : effect === "farve" ? 0.45 : 0 }} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

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
