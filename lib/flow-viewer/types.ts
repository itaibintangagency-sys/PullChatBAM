/** Bentuk data "ramping" yang dipakai viewer. Tidak ada kredensial, kode, atau parameter n8n di sini. */

export type Kind =
  | "trigger"   // pemicu workflow
  | "code"      // olah data / kode
  | "decision"  // IF / Switch
  | "data"      // baca-tulis spreadsheet, cache, database, penyimpanan
  | "http"      // panggilan ke layanan lain (mis. AI)
  | "merge"     // penggabung cabang
  | "wait"      // jeda
  | "stop"      // titik berhenti (No-Op "STOP …")
  | "message"   // kirim pesan / balasan
  | "subflow";  // memanggil alur lain

export interface Stage {
  id: string;
  short: string;                         // nama pendek untuk label di kanvas
  title: string;
  desc: string;                          // penjelasan bahasa sederhana
  hue: number;                           // 0–360, untuk warna tahap
  box: [number, number, number, number]; // x1, y1, x2, y2 (world units)
}

export interface FlowNode {
  id: number;
  tech: string;                          // nama teknis (sudah disamarkan)
  plain: string;                         // nama bahasa sederhana
  kind: Kind;
  sub?: "if" | "switch";
  x: number;                             // PUSAT node (world units)
  y: number;
  stage: number;                         // indeks ke stages[]
  key?: string;                          // nameKey(nama node asli): mencocokkan jejak eksekusi ke node ini
}

export interface FlowEdge {
  from: number;
  to: number;
  out: number;                           // indeks output pada node asal (IF: 0 = ya, 1 = tidak)
}

export interface Scenario {
  id: string;
  title: string;
  desc: string;
  path: number[];                        // urutan id node yang dilalui
}

export interface FlowData {
  title: string;
  subtitle: string;
  stages: Stage[];
  nodes: FlowNode[];
  edges: FlowEdge[];
  scenarios: Scenario[];
}

/** Satu alur di perpustakaan. */
export interface LibItem {
  id: string;
  title: string;
  desc: string;
  status: "aktif" | "nonaktif" | "arsip";
  nodeCount: number;
  flow: FlowData;
}

/** Folder proyek: kumpulan alur yang saling berkaitan. */
export interface LibFolder {
  id: string;
  title: string;
  desc: string;
  items: LibItem[];
}

export interface Library {
  title: string;
  subtitle: string;
  folders: LibFolder[];
}
