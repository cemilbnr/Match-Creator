import type { Cell, PieceColor } from '../../types';

export interface Rect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NaturalSize {
  w: number;
  h: number;
}

export interface AnalysisResult {
  rectId: string;
  rows: number;
  cols: number;
  /** cells[row][col]. null = empty / unknown / background. The analyzer
   *  never emits `'gap'` — gaps are added by the user via the retouch
   *  brush after detection. The field is typed as `Cell[][]` so painted
   *  overrides flow through without widening. */
  cells: Cell[][];
}

// ---------- Image loading ---------------------------------------------------

// A one-entry cache so multiple analyses against the same image don't pay
// the decode + getImageData cost repeatedly.
let cachedUrl: string | null = null;
let cachedData: ImageData | null = null;

async function loadImageData(url: string): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0);
      try {
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
      } catch {
        // Canvas tainted — source not same-origin. Blob URLs from loaded
        // files should be fine; this is just a safety net.
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function getImageData(url: string): Promise<ImageData | null> {
  if (url === cachedUrl && cachedData) return cachedData;
  const data = await loadImageData(url);
  cachedUrl = url;
  cachedData = data;
  return data;
}

// ---------- Grid detection via autocorrelation ------------------------------

/** Given a 1D luminance profile along one axis of the cropped board, pick
 *  the cell count that best explains its periodicity.
 *
 *  For each candidate N we compute the MEAN autocorrelation across every
 *  multiple of the implied lag (L/N, 2L/N, 3L/N, …). A harmonic of the
 *  fundamental — e.g. detecting 6 when the truth is 3 — has more multiples
 *  to average, and half of those multiples land at non-tile positions
 *  (mid-tile highlights, mid-tile shadows). Averaging drags a harmonic's
 *  score down relative to the true fundamental.
 *
 *  We then apply one more bias: the smallest N whose score is within
 *  85% of the best wins. This flips ties in favor of the fundamental when
 *  harmonics happen to score close due to strong within-tile texture
 *  (common on glossy match-3 tile art with highlight + shadow). */
function detectCellCount(
  profile: number[],
  minCells: number,
  maxCells: number,
): number {
  const n = profile.length;
  if (n < minCells * 4) return minCells;

  const mean = profile.reduce((a, b) => a + b, 0) / n;
  const centered = profile.map((v) => v - mean);
  const variance = centered.reduce((a, b) => a + b * b, 0);
  if (variance < 1e-3) return minCells;

  const scores: number[] = [];
  for (let N = minCells; N <= maxCells; N++) {
    const lag = Math.round(n / N);
    if (lag < 4) {
      scores.push(-Infinity);
      continue;
    }
    let total = 0;
    let peaks = 0;
    for (let k = 1; k * lag < n; k++) {
      const shift = k * lag;
      let corr = 0;
      let count = 0;
      for (let i = 0; i + shift < n; i++) {
        corr += centered[i]! * centered[i + shift]!;
        count++;
      }
      if (count > 0) {
        total += corr / count;
        peaks++;
      }
    }
    scores.push(peaks > 0 ? total / peaks : -Infinity);
  }

  let maxScore = -Infinity;
  for (const s of scores) if (s > maxScore) maxScore = s;
  if (maxScore <= 0) return minCells;
  const threshold = 0.85 * maxScore;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i]! >= threshold) return minCells + i;
  }
  return minCells;
}

// ---------- Hue-based classification ----------------------------------------

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

function classifyHue(h: number): PieceColor | null {
  if (h >= 340 || h <= 20) return 'red';
  if (h >= 40 && h <= 70) return 'yellow';
  if (h >= 80 && h <= 160) return 'green';
  if (h >= 190 && h <= 260) return 'blue';
  return null;
}

/** Sample the central portion of the cell, build a saturation-weighted hue
 *  histogram, and return the color that best matches the dominant hue. Cells
 *  whose pixels are almost all unsaturated (tile slot background) come back
 *  as null. */
function classifyCell(
  img: ImageData,
  cx: number,
  cy: number,
  cw: number,
  ch: number,
): PieceColor | null {
  // Sample only the center 50% of the cell so tile-slot borders don't bias
  // the hue.
  const marginX = cw * 0.25;
  const marginY = ch * 0.25;
  const x0 = Math.max(0, Math.floor(cx + marginX));
  const y0 = Math.max(0, Math.floor(cy + marginY));
  const x1 = Math.min(img.width, Math.floor(cx + cw - marginX));
  const y1 = Math.min(img.height, Math.floor(cy + ch - marginY));

  const buckets = new Float32Array(36); // 10-degree hue buckets
  let totalSaturation = 0;
  let pixelCount = 0;

  const step = Math.max(1, Math.floor(Math.min(cw, ch) / 20));
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const idx = (y * img.width + x) * 4;
      const r = img.data[idx]!;
      const g = img.data[idx + 1]!;
      const b = img.data[idx + 2]!;
      const { h, s, l } = rgbToHsl(r, g, b);
      // Skip near-white/near-black: tile specular highlights and shadow
      // corners would otherwise drag the mean.
      if (l < 0.12 || l > 0.94) continue;
      const bucket = Math.floor(h / 10) % 36;
      buckets[bucket] = buckets[bucket]! + s;
      totalSaturation += s;
      pixelCount++;
    }
  }

  if (pixelCount === 0) return null;
  const avgSat = totalSaturation / pixelCount;
  // Tile slot background is desaturated. Below this threshold there's no
  // meaningful dominant hue — report as empty.
  if (avgSat < 0.18) return null;

  let peakBucket = 0;
  let peakWeight = 0;
  for (let i = 0; i < 36; i++) {
    if (buckets[i]! > peakWeight) {
      peakWeight = buckets[i]!;
      peakBucket = i;
    }
  }
  const peakHue = peakBucket * 10 + 5;
  return classifyHue(peakHue);
}

// ---------- Entry point ----------------------------------------------------

const MIN_CELLS = 3;
const MAX_CELLS = 20;

export async function analyzeImage(
  imageUrl: string,
  rects: Rect[],
): Promise<AnalysisResult[]> {
  const img = await getImageData(imageUrl);
  if (!img) return [];

  const results: AnalysisResult[] = [];

  for (const rect of rects) {
    const rx = Math.max(0, Math.floor(rect.x));
    const ry = Math.max(0, Math.floor(rect.y));
    const rw = Math.min(img.width - rx, Math.floor(rect.w));
    const rh = Math.min(img.height - ry, Math.floor(rect.h));
    if (rw < 24 || rh < 24) continue;

    // Luminance profile per row / per column.
    const rowProfile = new Array<number>(rh);
    const colProfile = new Array<number>(rw).fill(0);

    for (let y = 0; y < rh; y++) {
      let rowSum = 0;
      for (let x = 0; x < rw; x++) {
        const idx = ((ry + y) * img.width + (rx + x)) * 4;
        const r = img.data[idx]!;
        const g = img.data[idx + 1]!;
        const b = img.data[idx + 2]!;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        rowSum += lum;
        colProfile[x] = colProfile[x]! + lum;
      }
      rowProfile[y] = rowSum / rw;
    }
    for (let x = 0; x < rw; x++) colProfile[x] = colProfile[x]! / rh;

    const maxRows = Math.min(MAX_CELLS, Math.floor(rh / 6));
    const maxCols = Math.min(MAX_CELLS, Math.floor(rw / 6));
    const rows = detectCellCount(rowProfile, MIN_CELLS, Math.max(MIN_CELLS, maxRows));
    const cols = detectCellCount(colProfile, MIN_CELLS, Math.max(MIN_CELLS, maxCols));

    const cellW = rw / cols;
    const cellH = rh / rows;

    const cells: Cell[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: Cell[] = [];
      for (let c = 0; c < cols; c++) {
        const cx = rx + c * cellW;
        const cy = ry + r * cellH;
        row.push(classifyCell(img, cx, cy, cellW, cellH));
      }
      cells.push(row);
    }

    results.push({ rectId: rect.id, rows, cols, cells });
  }

  return results;
}

export function clearAnalyzerCache() {
  cachedUrl = null;
  cachedData = null;
}
