// Shared bingo logic — must stay in sync with src/utils/bingo.ts

export const BINGO_COLS = [
  { label: "B", min: 1,  max: 5  },
  { label: "I", min: 6,  max: 10 },
  { label: "N", min: 11, max: 15 },
  { label: "G", min: 16, max: 20 },
  { label: "O", min: 21, max: 24 },
];

function xorshift(seed: number): () => number {
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

// Generates a deterministic 5×5 card for ID 1–600.
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

type Pattern = [number, number][];

export function getWinPattern(card: (number | null)[][], called: Set<number>): { pattern: Pattern; name: string } | null {
  const m = card.map(row => row.map(n => n === null || called.has(n)));

  for (let r = 0; r < 5; r++) {
    if (m[r].every(Boolean))
      return { pattern: [[r,0],[r,1],[r,2],[r,3],[r,4]], name: `row_${r}` };
  }
  for (let c = 0; c < 5; c++) {
    if (m.every(row => row[c]))
      return { pattern: [[0,c],[1,c],[2,c],[3,c],[4,c]], name: `col_${c}` };
  }
  if (m.every((row, i) => row[i]))
    return { pattern: [[0,0],[1,1],[2,2],[3,3],[4,4]], name: "diag_main" };
  if (m.every((row, i) => row[4 - i]))
    return { pattern: [[0,4],[1,3],[2,2],[3,1],[4,0]], name: "diag_anti" };

  return null;
}
