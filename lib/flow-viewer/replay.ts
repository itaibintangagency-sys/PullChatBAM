import type { FlowData, Scenario } from './types';
import { nameKey } from './key';

/** Satu langkah jejak eksekusi (format tabel execution_traces.steps). Tidak berisi isi pesan. */
export interface TraceStep {
  n: string;        // nama node asli
  t: number;        // ms sejak eksekusi mulai
  d: number;        // lama node (ms)
  s: 'ok' | 'error';
  p: string | null; // node asal
  r: number;        // urutan jalan
}

export interface Replay {
  flow: FlowData;        // alur dengan SATU skenario: jalur eksekusi ini
  errorIds: number[];    // id node yang gagal
  executed: number;      // langkah yang dikenali dan dijalankan
  unknown: number;       // langkah yang namanya tidak ada di peta alur (alur mungkin berubah)
  skipped: number;       // langkah yang tidak bisa disambungkan ke jalur (mis. cabang paralel)
}

/**
 * Menyusun skenario "replay" dari jejak eksekusi.
 * Viewer menganimasikan jalur lewat sambungan nyata, jadi setiap dua node berurutan harus punya sambungan:
 * bila node berikutnya tidak tersambung langsung, dicari rute terpendek (diutamakan lewat node yang memang dijalankan).
 * Mengembalikan null bila tidak ada satu pun langkah yang dikenali.
 */
export function buildReplay(base: FlowData, steps: TraceStep[], title: string, desc: string): Replay | null {
  const byKey = new Map<string, number>();
  base.nodes.forEach(n => { if (n.key) byKey.set(n.key, n.id); });

  const ordered = [...steps].sort((a, b) => a.r - b.r);
  const ids: number[] = [];
  const errorSet = new Set<number>();
  let unknown = 0;
  for (const s of ordered) {
    const id = byKey.get(nameKey(s.n));
    if (id === undefined) { unknown++; continue; }
    ids.push(id);
    if (s.s === 'error') errorSet.add(id);
  }
  if (ids.length === 0) return null;

  const adj = new Map<number, number[]>();
  const hasEdge = new Set<string>();
  for (const e of base.edges) {
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
    hasEdge.add(`${e.from}>${e.to}`);
  }
  const executed = new Set(ids);

  const route = (a: number, b: number, only: Set<number> | null): number[] | null => {
    const prev = new Map<number, number | null>([[a, null]]);
    const q = [a];
    while (q.length) {
      const u = q.shift()!;
      if (u === b) break;
      for (const v of adj.get(u) ?? []) {
        if (prev.has(v)) continue;
        if (only && v !== b && !only.has(v)) continue;
        prev.set(v, u);
        q.push(v);
      }
    }
    if (!prev.has(b)) return null;
    const out: number[] = [];
    for (let u: number | null | undefined = b; u !== null && u !== undefined; u = prev.get(u)) out.push(u);
    return out.reverse();
  };

  const path: number[] = [ids[0]];
  let skipped = 0;
  for (let i = 1; i < ids.length; i++) {
    const cur = path[path.length - 1];
    const b = ids[i];
    if (b === cur) continue;
    if (hasEdge.has(`${cur}>${b}`)) { path.push(b); continue; }
    const seg = route(cur, b, executed) ?? route(cur, b, null);
    if (!seg) { skipped++; continue; }
    path.push(...seg.slice(1));
  }

  const totalMs = ordered.length ? Math.max(...ordered.map(s => s.t + s.d)) : 0;
  const sec = totalMs >= 1000 ? `${(totalMs / 1000).toFixed(1)} detik` : `${totalMs} ms`;
  const scenario: Scenario = {
    id: 'replay',
    title: 'Jalur eksekusi ini',
    desc: `${ids.length} langkah dijalankan dalam ${sec}. Node yang pudar tidak dijalankan pada eksekusi ini${errorSet.size ? '; node merah gagal' : ''}.`,
    path,
  };
  const flow: FlowData = { ...base, title, subtitle: desc, scenarios: [scenario] };
  return { flow, errorIds: [...errorSet], executed: ids.length, unknown, skipped };
}
