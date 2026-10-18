// Deteksi pengulangan siaran Channel (murni, tanpa React/Supabase supaya mudah diuji).
// Dipakai halaman /channel untuk menampilkan peringatan dan kartu "brand terakhir terkirim".

export interface LogMini {
  id: number;
  broadcast_at: string;
  link_ids: string[] | null;
  brand_list: string[] | null;
}

export interface PengulanganInfo {
  brandTerakhir: string | null; // brand pertama pada siaran terbaru
  brandBeruntun: number; // berapa siaran terbaru berturut-turut yang memuat brand itu
  produkUlang: { id: string; kali: number } | null; // produk yang sama muncul >= 2 kali dalam jendela
  jendela: number; // jumlah siaran terbaru yang diperiksa
  perluPeringatan: boolean;
}

export const JENDELA_SIARAN = 10;
export const AMBANG_BRAND_BERUNTUN = 3;

// `logs` harus sudah terurut dari yang TERBARU ke yang terlama (urutan yang dipakai halaman).
export function analisaPengulangan(logs: LogMini[]): PengulanganInfo {
  const terbaru = logs.slice(0, JENDELA_SIARAN);
  const brandTerakhir = logs[0]?.brand_list?.[0] ?? null;

  let brandBeruntun = 0;
  if (brandTerakhir) {
    for (const l of logs) {
      if ((l.brand_list ?? []).includes(brandTerakhir)) brandBeruntun += 1;
      else break;
    }
  }

  const hitung = new Map<string, number>();
  for (const l of terbaru) {
    // satu produk dihitung sekali per siaran
    for (const id of new Set(l.link_ids ?? [])) hitung.set(id, (hitung.get(id) ?? 0) + 1);
  }
  let produkUlang: { id: string; kali: number } | null = null;
  hitung.forEach((kali, id) => {
    if (kali >= 2 && (!produkUlang || kali > produkUlang.kali)) produkUlang = { id, kali };
  });

  return {
    brandTerakhir,
    brandBeruntun,
    produkUlang,
    jendela: terbaru.length,
    perluPeringatan: brandBeruntun >= AMBANG_BRAND_BERUNTUN || produkUlang !== null,
  };
}
