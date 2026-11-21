/**
 * Returns true for ~3 seconds after `value` strictly INCREASES
 * (edge-triggered). Decreases and resets-to-zero (game end memory clear)
 * never flash — mirrors the game's "Grade UP" sound condition.
 * The initial mount does not flash.
 */

import { useRef } from "react";

const FLASH_MS = 3000;

export function useIncrementFlash(value: number): boolean {
  const prev = useRef(value);
  const until = useRef(0);

  if (value > prev.current) {
    until.current = Date.now() + FLASH_MS;
  }
  if (value !== prev.current) {
    prev.current = value;
  }

  return Date.now() < until.current;
}
