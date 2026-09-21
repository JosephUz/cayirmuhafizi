// Dünya kurulumu için tekrarlanabilir rastgelelik; oynanış için Math.random.
let seed = 814;
export function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
export function range(a, b) { return a + (b - a) * rand(); }
export function reseed(s) { seed = s >>> 0; }

export function rrand(a, b) { return a + (b - a) * Math.random(); }
export function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
