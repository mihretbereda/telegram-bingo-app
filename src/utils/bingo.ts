// Display columns — used for the master board and cartela column headers.
// Numbers 1–24 split into 5 groups; O has 4 (not 5) numbers.
export const BINGO_COLS: { label: string; min: number; max: number; color: string }[] = [
  { label: "B", min: 1,  max: 5,  color: "#4a90d9" },
  { label: "I", min: 6,  max: 10, color: "#7c4dff" },
  { label: "N", min: 11, max: 15, color: "#00c853" },
  { label: "G", min: 16, max: 20, color: "#f5a623" },
  { label: "O", min: 21, max: 24, color: "#ff4842" },
];

// Wang hash + xorshift — better seed mixing than a raw multiply.
function xorshift(seed: number) {
  let s = seed >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
  s = (s ^ (s >>> 16)) >>> 0;
  s = s || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17; s >>>= 0;
    s ^= s << 5;  s >>>= 0;
    return s / 0x100000000;
  };
}

// Generates a deterministic 5×5 bingo card for ID 1–600.
// Each card is a unique permutation of 1–24; center (row 2, col 2) is free (null).
export function generateCartela(id: number): (number | null)[][] {
  const rng  = xorshift(id);
  const pool = Array.from({ length: 24 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  let idx = 0;
  return Array.from({ length: 5 }, (_, row) =>
    Array.from({ length: 5 }, (_, col) =>
      row === 2 && col === 2 ? null : pool[idx++]
    )
  );
}

// Validates that every ID 1–600 produces a unique card layout.
// Returns { valid: true } if all 600 are unique, or lists duplicates.
export function validateCartelas(): { valid: boolean; duplicates: Array<{ id: number; clashWith: number }> } {
  const seen = new Map<string, number>();
  const duplicates: Array<{ id: number; clashWith: number }> = [];
  for (let id = 1; id <= 600; id++) {
    const key = generateCartela(id).flat().map(n => n ?? 0).join(",");
    const prev = seen.get(key);
    if (prev !== undefined) {
      duplicates.push({ id, clashWith: prev });
    } else {
      seen.set(key, id);
    }
  }
  return { valid: duplicates.length === 0, duplicates };
}

export function getBallLetter(n: number): string {
  if (n <= 5)  return "B";
  if (n <= 10) return "I";
  if (n <= 15) return "N";
  if (n <= 20) return "G";
  return "O";
}

export function getBallColor(n: number): string {
  const col = BINGO_COLS.find(c => n >= c.min && n <= c.max);
  return col?.color ?? "#fff";
}
