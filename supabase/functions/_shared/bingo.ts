// Shared bingo logic — must stay in sync with src/utils/bingo.ts

export const BINGO_COLS = [
  { label: "B", min: 1,  max: 15  },
  { label: "I", min: 16, max: 30  },
  { label: "N", min: 31, max: 45  },
  { label: "G", min: 46, max: 60  },
  { label: "O", min: 61, max: 75  },
];

function xorshift(seed: number): () => number {
  let s = ((seed ^ 0x9e3779b9) >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17; s >>>= 0;
    s ^= s << 5;  s >>>= 0;
    return s / 0x100000000;
  };
}

export function generateCartela(id: number): (number | null)[][] {
  const columns = BINGO_COLS.map(({ min, max }, ci) => {
    const rng  = xorshift(id * 601 + ci * 127);
    const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 5);
  });
  return Array.from({ length: 5 }, (_, row) =>
    columns.map((col, ci) => (row === 2 && ci === 2 ? null : col[row])),
  );
}

type Pattern = [number, number][];

export function getWinPattern(card: (number | null)[][], called: Set<number>): { pattern: Pattern; name: string } | null {
  const m = card.map((row) => row.map((n) => n === null || called.has(n)));

  for (let r = 0; r < 5; r++) {
    if (m[r].every(Boolean))
      return { pattern: [[r,0],[r,1],[r,2],[r,3],[r,4]], name: `row_${r}` };
  }
  for (let c = 0; c < 5; c++) {
    if (m.every((row) => row[c]))
      return { pattern: [[0,c],[1,c],[2,c],[3,c],[4,c]], name: `col_${c}` };
  }
  if (m.every((row, i) => row[i]))
    return { pattern: [[0,0],[1,1],[2,2],[3,3],[4,4]], name: "diag_main" };
  if (m.every((row, i) => row[4 - i]))
    return { pattern: [[0,4],[1,3],[2,2],[3,1],[4,0]], name: "diag_anti" };

  return null;
}
