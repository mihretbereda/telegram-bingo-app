export const BINGO_COLS: { label: string; min: number; max: number; color: string }[] = [
  { label: "B", min: 1,  max: 15,  color: "#4a90d9" },
  { label: "I", min: 16, max: 30,  color: "#7c4dff" },
  { label: "N", min: 31, max: 45,  color: "#00c853" },
  { label: "G", min: 46, max: 60,  color: "#f5a623" },
  { label: "O", min: 61, max: 75,  color: "#ff4842" },
];

function xorshift(seed: number) {
  let s = (seed ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17; s >>>= 0;
    s ^= s << 5;  s >>>= 0;
    return s / 0x100000000;
  };
}

// Generates a deterministic 5×5 bingo card for a given cartela ID
// Uses standard B:1-15  I:16-30  N:31-45  G:46-60  O:61-75 ranges
export function generateCartela(id: number): (number | null)[][] {
  const columns = BINGO_COLS.map(({ min, max }, ci) => {
    const rng = xorshift(id * 601 + ci * 127);
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

export function getBallLetter(n: number): string {
  if (n <= 15) return "B";
  if (n <= 30) return "I";
  if (n <= 45) return "N";
  if (n <= 60) return "G";
  return "O";
}

export function getBallColor(n: number): string {
  const col = BINGO_COLS.find((c) => n >= c.min && n <= c.max);
  return col?.color ?? "#fff";
}
