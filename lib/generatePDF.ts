import { PDFDocument, PDFNumber, PDFOperator } from "pdf-lib";
import type { Shape } from "@/components/ShapeSelector";

const CM_TO_PT = 10 * (72 / 25.4);
const K = 0.5523;

const pt = (n: number) => PDFNumber.of(n);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const op = (name: string, args: any[] = []) => (PDFOperator as any).of(name, args);
const M = (x: number, y: number) => op("m", [pt(x), pt(y)]);
const L = (x: number, y: number) => op("l", [pt(x), pt(y)]);
const C = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) =>
  op("c", [pt(x1), pt(y1), pt(x2), pt(y2), pt(x3), pt(y3)]);
const H = op("h");

function rectPath(x: number, y: number, w: number, h: number): PDFOperator[] {
  return [M(x, y), L(x + w, y), L(x + w, y + h), L(x, y + h), H];
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): PDFOperator[] {
  return [
    M(x + r, y),
    L(x + w - r, y), C(x + w - r + K * r, y, x + w, y + r - K * r, x + w, y + r),
    L(x + w, y + h - r), C(x + w, y + h - r + K * r, x + w - r + K * r, y + h, x + w - r, y + h),
    L(x + r, y + h), C(x + r - K * r, y + h, x, y + h - r + K * r, x, y + h - r),
    L(x, y + r), C(x, y + r - K * r, x + r - K * r, y, x + r, y),
    H,
  ];
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): PDFOperator[] {
  return [
    M(cx + rx, cy),
    C(cx + rx, cy + K * ry, cx + K * rx, cy + ry, cx, cy + ry),
    C(cx - K * rx, cy + ry, cx - rx, cy + K * ry, cx - rx, cy),
    C(cx - rx, cy - K * ry, cx - K * rx, cy - ry, cx, cy - ry),
    C(cx + K * rx, cy - ry, cx + rx, cy - K * ry, cx + rx, cy),
    H,
  ];
}

function polygonPath(points: { x: number; y: number }[]): PDFOperator[] {
  if (points.length < 3) return [];
  return [M(points[0].x, points[0].y), ...points.slice(1).map((p) => L(p.x, p.y)), H];
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(",")[1];
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Push operators in batches to avoid argument limit with complex polygons
function pushOps(page: ReturnType<PDFDocument["addPage"]>, ops: PDFOperator[]) {
  for (let i = 0; i < ops.length; i += 100) {
    page.pushOperators(...ops.slice(i, i + 100));
  }
}

const MM_TO_PT = 72 / 25.4;

// Build the shape path for a given bounding box (x, y = bottom-left in PDF coords)
function shapePath(
  shape: Shape,
  x: number, y: number, w: number, h: number,
  diecuPoints?: { x: number; y: number }[],
  cornerRadiusMm?: number,
): PDFOperator[] {
  switch (shape) {
    case "rectangle": {
      if (cornerRadiusMm !== undefined && cornerRadiusMm > 0) {
        const r = Math.min(cornerRadiusMm * MM_TO_PT, Math.min(w, h) / 2);
        return roundedRectPath(x, y, w, h, r);
      }
      return rectPath(x, y, w, h);
    }
    case "circle":
    case "oval":
      return ellipsePath(x + w / 2, y + h / 2, w / 2, h / 2);
    case "diecut":
      if (diecuPoints && diecuPoints.length > 4) {
        // Points are normalized 0–1 in canvas coords (y-down) → map to box (x,y,w,h)
        return polygonPath(
          diecuPoints.map((p) => ({ x: x + p.x * w, y: y + (1 - p.y) * h }))
        );
      }
      return roundedRectPath(x, y, w, h, Math.min(w, h) * 0.02);
  }
}

export async function generatePrintPDF({
  imageDataUrl,
  widthCm,
  heightCm,
  shape,
  diecuPoints,
  imagePadding,
  whiteUnderprint,
  contourStroke,
  cornerRadiusMm,
}: {
  imageDataUrl: string;
  widthCm: number;
  heightCm: number;
  shape: Shape;
  diecuPoints?: { x: number; y: number }[];
  imagePadding?: number; // 0 = no extra padding (already baked into pre-rendered image)
  whiteUnderprint?: boolean; // adds white spot color page for transparent stickers
  contourStroke?: "ingen" | "lille" | "mellem" | "stor"; // white border around sticker
  cornerRadiusMm?: number; // corner radius in mm for rounded shape
}): Promise<Uint8Array> {
  const W = widthCm * CM_TO_PT;
  const HH = heightCm * CM_TO_PT;
  const BLEED = 0.3 * CM_TO_PT; // 3 mm page bleed margin
  const PRINT_BLEED = 0.2 * CM_TO_PT; // 2 mm image bleed (extends past cut line)

  // Image padding — use provided value, or default to shape-based (4% / 2%)
  const PAD = imagePadding !== undefined ? imagePadding : (shape === "diecut" ? 0.02 : 0.04);
  const imgX = BLEED + W * PAD;
  const imgY = BLEED + HH * PAD;
  const imgW = W * (1 - 2 * PAD);
  const imgH = HH * (1 - 2 * PAD);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle("LabelEasy – Trykfil");
  pdfDoc.setCreator("labeleasy.dk");

  // Page = sticker size + bleed on all sides
  const page = pdfDoc.addPage([W + 2 * BLEED, HH + 2 * BLEED]);

  // ── 1. White contour stroke (outside sticker, non-diecut only) ──────────────
  const STROKE_CM: Record<string, number> = { ingen: 0, lille: 0.1, mellem: 0.2, stor: 0.4 };
  const strokePt = (STROKE_CM[contourStroke ?? "ingen"] ?? 0) * CM_TO_PT;
  if (strokePt > 0 && shape !== "diecut") {
    const strokeOps = shapePath(shape, BLEED - strokePt, BLEED - strokePt, W + 2 * strokePt, HH + 2 * strokePt, undefined, cornerRadiusMm);
    page.pushOperators(op("q"), op("g", [pt(1)]));
    pushOps(page, strokeOps);
    page.pushOperators(op("f"), op("Q"));
  }

  // ── 2. White backing shape (full sticker size) ──────────────────────────────
  const backingOps = shapePath(shape, BLEED, BLEED, W, HH, diecuPoints, cornerRadiusMm);
  page.pushOperators(op("q"), op("g", [pt(1)])); // save, white fill
  pushOps(page, backingOps);
  page.pushOperators(op("f"), op("Q")); // fill, restore

  // ── 2. Draw artwork with bleed ───────────────────────────────────────────────
  const bytes = dataUrlToBytes(imageDataUrl);

  if (imagePadding === 0) {
    // Pre-rendered canvas: padding already baked in. Extend 2 mm past cut line
    // for bleed — no clip needed (image scales uniformly, content fills bleed zone).
    const bX = BLEED - PRINT_BLEED;
    const bY = BLEED - PRINT_BLEED;
    const bW = W + 2 * PRINT_BLEED;
    const bH = HH + 2 * PRINT_BLEED;
    if (imageDataUrl.startsWith("data:application/pdf")) {
      const srcDoc = await PDFDocument.load(bytes);
      const [embeddedPage] = await pdfDoc.embedPages([srcDoc.getPages()[0]]);
      page.drawPage(embeddedPage, { x: bX, y: bY, width: bW, height: bH });
    } else {
      const isPng = imageDataUrl.startsWith("data:image/png");
      const img = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
      page.drawImage(img, { x: bX, y: bY, width: bW, height: bH });
    }
  } else {
    // Vector PDF or padded image: clip to shape, draw at sticker size.
    // For diecut: clip to FULL sticker box (polygon is normalized to full canvas).
    const clipOps = shape === "diecut"
      ? shapePath(shape, BLEED, BLEED, W, HH, diecuPoints, cornerRadiusMm)
      : shapePath(shape, imgX, imgY, imgW, imgH, diecuPoints, cornerRadiusMm);
    page.pushOperators(op("q"));
    pushOps(page, clipOps);
    page.pushOperators(op("W"), op("n"));
    if (imageDataUrl.startsWith("data:application/pdf")) {
      const srcDoc = await PDFDocument.load(bytes);
      const [embeddedPage] = await pdfDoc.embedPages([srcDoc.getPages()[0]]);
      page.drawPage(embeddedPage, { x: BLEED, y: BLEED, width: W, height: HH });
    } else {
      const isPng = imageDataUrl.startsWith("data:image/png");
      const img = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
      page.drawImage(img, { x: BLEED, y: BLEED, width: W, height: HH });
    }
    page.pushOperators(op("Q")); // restore (removes clip)
  }

  // ── 3. Stans cut line (RGB pink — visible in all PDF viewers) ───────────────
  const stansOps = shapePath(shape, BLEED, BLEED, W, HH, diecuPoints, cornerRadiusMm);
  page.pushOperators(
    op("q"),
    op("RG", [PDFNumber.of(0.91), PDFNumber.of(0.08), PDFNumber.of(0.63)]), // #E8149E pink
    op("w", [PDFNumber.of(0.75)])
  );
  pushOps(page, stansOps);
  page.pushOperators(op("S"), op("Q"));

  // ── 4. White spot color page (for transparent stickers) ─────────────────────
  if (whiteUnderprint) {
    const pageW = W + 2 * BLEED;
    const pageH = HH + 2 * BLEED;
    const page2 = pdfDoc.addPage([pageW, pageH]);

    // Gray background — signals this is the white spot color layer
    page2.pushOperators(op("q"), op("g", [pt(0.82)]));
    pushOps(page2, rectPath(0, 0, pageW, pageH));
    page2.pushOperators(op("f"), op("Q"));

    // Black filled sticker shape = "print white ink here"
    const whiteLayerOps = shapePath(shape, BLEED, BLEED, W, HH, diecuPoints, cornerRadiusMm);
    page2.pushOperators(op("q"), op("g", [pt(0)]));
    pushOps(page2, whiteLayerOps);
    page2.pushOperators(op("f"), op("Q"));

    // Same pink cut line
    const stansOps2 = shapePath(shape, BLEED, BLEED, W, HH, diecuPoints, cornerRadiusMm);
    page2.pushOperators(
      op("q"),
      op("RG", [PDFNumber.of(0.91), PDFNumber.of(0.08), PDFNumber.of(0.63)]),
      op("w", [PDFNumber.of(0.75)])
    );
    pushOps(page2, stansOps2);
    page2.pushOperators(op("S"), op("Q"));
  }

  return pdfDoc.save();
}
