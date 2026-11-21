/**
 * Playfield renderer — authentic TGM3 block sprites.
 *
 * Pixel data comes from the original visualizer's BlockPixelData.cs
 * (extracted to src/assets/blockPixelData.ts): 16x16 BGRA sprites with
 * separate WORLD / CLASSIC rule skins, jewel (gem) sprites, and IBM blocks.
 *
 * Rendering matches the original PlayfieldCard:
 * - 10 columns x 20 VISIBLE rows (top 2 spawn-area rows are not drawn)
 * - display row 0 (top) = game row 19; y=0 is the bottom row
 * - empty cells are transparent: the card background shows through
 * - sprites are drawn with high-quality smoothing at display resolution
 *   (DPR-aware backing store) for the soft in-game look
 */

import { useEffect, useMemo, useRef } from "react";
import { BLOCK_SIZE, SPRITES_B64 } from "../assets/blockPixelData";

const COLS = 10;
const VISIBLE_ROWS = 20; // original renders rows 0-19 of the 22-row memory playfield

/** Deep compare of the 22x10 cell values (cheap: 220 integer compares). */
function playfieldSame(a: number[][], b: number[][]): boolean {
  for (let y = 0; y < VISIBLE_ROWS; y++) {
    const ra = a[y];
    const rb = b[y];
    if (!ra || !rb) return false;
    for (let x = 0; x < COLS; x++) {
      if (ra[x] !== rb[x]) return false;
    }
  }
  return true;
}
/** Decode a base64 BGRA sprite into an RGBA offscreen canvas (once, cached). */
function makeSprite(b64: string): HTMLCanvasElement {
  const bin = atob(b64);
  const canvas = document.createElement("canvas");
  canvas.width = BLOCK_SIZE;
  canvas.height = BLOCK_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  const img = ctx.createImageData(BLOCK_SIZE, BLOCK_SIZE);
  for (let i = 0; i < BLOCK_SIZE * BLOCK_SIZE; i++) {
    img.data[i * 4 + 0] = bin.charCodeAt(i * 4 + 2); // R <- BGRA[2]
    img.data[i * 4 + 1] = bin.charCodeAt(i * 4 + 1); // G <- BGRA[1]
    img.data[i * 4 + 2] = bin.charCodeAt(i * 4 + 0); // B <- BGRA[0]
    img.data[i * 4 + 3] = bin.charCodeAt(i * 4 + 3); // A <- BGRA[3]
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Port of BlockPixelData.GetBlockData(blockType, controlMode).
 *  Empty cells return null — nothing is drawn, so the card background
 *  shows through (the field blends into the card). */
function getBlockSprite(
  blockType: number,
  controlMode: string,
  sprites: Record<string, HTMLCanvasElement>
): HTMLCanvasElement | null {
  const prefix = controlMode === "WORLD" ? "W" : "C";

  if (blockType === 0) return null;

  if (blockType >= 0x02 && blockType <= 0x09) return sprites[`${prefix}Block${blockType}`];
  if (blockType >= 0x12 && blockType <= 0x19) return sprites[`GBlock${blockType - 0x10}`];
  if (blockType >= 0x22 && blockType <= 0x28) return sprites[`${prefix}BlockIBM`]; // IBM

  return null;
}

export function PlayfieldCanvas({
  playfield,
  controlMode,
  hidden,
}: {
  playfield: number[][];
  controlMode: string;
  /** roll practice: draw nothing (the empty field still holds its geometry) */
  hidden?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Last drawn frame (content + backing width): the playfield prop is a fresh
  // array identity on every tick, so identity checks never skip — comparing
  // the 200 cells turns unchanged ticks into ~200 integer compares.
  const lastDrawn = useRef<{ rows: number[][]; w: number; hidden?: boolean } | null>(null);

  // Decode all sprites once
  const sprites = useMemo(() => {
    const map: Record<string, HTMLCanvasElement> = {};
    for (const [name, b64] of Object.entries(SPRITES_B64)) {
      map[name] = makeSprite(b64);
    }
    return map;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Cheap guard FIRST (deep row compare): identical frames — including
    // repeated hidden frames — return before any layout read. clientWidth
    // forces a synchronous reflow, so it is only read when a redraw is due
    // (the panel window is fixed-size, so width cannot change between
    // content changes).
    const prev = lastDrawn.current;
    if (
      prev &&
      prev.hidden === hidden &&
      (hidden || playfieldSame(prev.rows, playfield))
    ) {
      return; // identical frame already on the canvas
    }

    // Backing store at display resolution (DPR-aware): sprites are upscaled
    // with high-quality smoothing — soft, in-game-like blocks instead of the
    // ragged look of non-integer nearest-neighbor scaling.
    const cssWidth = canvas.clientWidth;
    if (cssWidth < 10) return;
    const dpr = window.devicePixelRatio || 1;
    const backingW = Math.round(cssWidth * dpr);

    lastDrawn.current = { rows: playfield, w: backingW, hidden };

    const backingH = backingW * 2;
    if (canvas.width !== backingW) {
      canvas.width = backingW;
      canvas.height = backingH;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // hidden (roll practice): the cleared canvas IS the final frame
    if (hidden) return;

    const cellW = canvas.width / COLS;
    const cellH = canvas.height / VISIBLE_ROWS;

    for (let displayY = 0; displayY < VISIBLE_ROWS; displayY++) {
      const gameY = VISIBLE_ROWS - 1 - displayY; // flip: y=0 is bottom
      const row = playfield[gameY] ?? [];
      for (let x = 0; x < COLS; x++) {
        const sprite = getBlockSprite(row[x] ?? 0, controlMode, sprites);
        if (!sprite) continue;
        ctx.drawImage(sprite, x * cellW, displayY * cellH, cellW, cellH);
      }
    }
  }, [playfield, controlMode, sprites, hidden]);

  return (
    <div className="playfield-box">
      <canvas ref={canvasRef} className="playfield-canvas" />
    </div>
  );
}
