import { PDFDocument, PDFName, PDFNumber, PDFDict, PDFOperator } from "pdf-lib";
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

// Build the shape path for a given bounding box (x, y = bottom-left in PDF coords)
function shapePath(
  shape: Shape,
  x: number, y: number, w: number, h: number,
  diecuPoints?: { x: number; y: number }[],
): PDFOperator[] {
  switch (shape) {
    case "rectangle":
      return rectPath(x, y, w, h);
    case "rounded":
      return roundedRectPath(x, y, w, h, Math.min(w, h) * 0.12);
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
}: {
  imageDataUrl: string;
  widthCm: number;
  heightCm: number;
  shape: Shape;
  diecuPoints?: { x: number; y: number }[];
  imagePadding?: number; // 0 = no extra padding (already baked into pre-rendered image)
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

  // ── 1. White backing shape (full sticker size) ──────────────────────────────
  const backingOps = shapePath(shape, BLEED, BLEED, W, HH, diecuPoints);
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
      ? shapePath(shape, BLEED, BLEED, W, HH, diecuPoints)
      : shapePath(shape, imgX, imgY, imgW, imgH, diecuPoints);
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

  // ── 3. Stans spot color cut line ────────────────────────────────────────────
  const tintFn = pdfDoc.context.obj({
    FunctionType: 2,
    Domain: [0, 1],
    C0: [0, 0, 0, 0],
    C1: [0, 1, 0, 0],
    N: 1,
  });
  const stansCS = pdfDoc.context.obj([
    PDFName.of("Separation"),
    PDFName.of("Stans"),
    PDFName.of("DeviceCMYK"),
    tintFn,
  ]);
  const gState = pdfDoc.context.obj({
    Type: PDFName.of("ExtGState"),
    OP: true,
    OPM: 1,
  });

  const resources = page.node.Resources()!;
  let csDict = resources.get(PDFName.of("ColorSpace")) as PDFDict | undefined;
  if (!csDict) {
    const d = pdfDoc.context.obj({});
    resources.set(PDFName.of("ColorSpace"), d);
    csDict = d as PDFDict;
  }
  (csDict as PDFDict).set(PDFName.of("Stans"), stansCS);

  let gsDict = resources.get(PDFName.of("ExtGState")) as PDFDict | undefined;
  if (!gsDict) {
    const d = pdfDoc.context.obj({});
    resources.set(PDFName.of("ExtGState"), d);
    gsDict = d as PDFDict;
  }
  (gsDict as PDFDict).set(PDFName.of("GS_OP"), gState);

  const stansOps = shapePath(shape, BLEED, BLEED, W, HH, diecuPoints);
  page.pushOperators(
    op("q"),
    op("gs", [PDFName.of("GS_OP")]),
    op("CS", [PDFName.of("Stans")]),
    op("SCN", [PDFNumber.of(1)]),
    op("w", [PDFNumber.of(0.5)])
  );
  pushOps(page, stansOps);
  page.pushOperators(op("S"), op("Q"));

  return pdfDoc.save();
}
