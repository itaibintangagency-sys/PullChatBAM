/**
 * Kunci pencocokan node: hash 64-bit dari nama node ASLI.
 * Dipakai di dua sisi (pembuat data dan halaman replay) supaya jejak eksekusi (yang memuat nama asli)
 * bisa dicocokkan ke node di viewer TANPA menaruh nama asli di data publik.
 * Bukan pengamanan kriptografis; hanya agar nama asli (mis. yang memuat nama orang) tidak tertulis polos.
 */
export function nameKey(name: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c;
    h2 = Math.imul(h2, 0x85ebca6b);
    h2 ^= h2 >>> 13;
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return hex(h1) + hex(h2);
}
