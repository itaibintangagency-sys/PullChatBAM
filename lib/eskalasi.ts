// Helper murni untuk halaman Tabel Eskalasi (/eskalasi).
// Sengaja tanpa React/Supabase supaya logika filter, sort, dan CSV mudah diuji.

export type StatusKey = 'OPEN' | 'PENDING' | 'RESOLVE';

// Kolom yang diambil dari tabel escalations (bukan select('*'): lebih ringan dan tidak membawa kolom yang tak dipakai).
export const ESKALASI_COLUMNS =
  'id, ticket_id, created_at, bot_source, nomor_wa, nama, category, sub_category, assigned_to, priority, status, ' +
  'resolved_at, customer_issue, data_notes, previous_assigned, reassigned_at, store_link';

export interface EskalasiRow {
  id: string;
  ticket_id: string;
  created_at: string | null;
  bot_source: string | null;
  nomor_wa: string;
  nama: string | null;
  category: string | null;
  sub_category: string | null;
  assigned_to: string | null;
  priority: string | null;
  status: string | null;
  resolved_at: string | null;
  customer_issue: string | null;
  data_notes: string | null;
  previous_assigned: string | null;
  reassigned_at: string | null;
  store_link: string | null;
}

const DAY_MS = 86_400_000;

/* ------------------------------ status, bot, jenis ------------------------------ */

export const STATUS_LABEL: Record<StatusKey, string> = {
  OPEN: 'Terbuka',
  PENDING: 'Menunggu',
  RESOLVE: 'Selesai',
};

// Status kosong atau tak dikenal dianggap OPEN (sama seperti WF bot).
export function statusOf(row: Pick<EskalasiRow, 'status'>): StatusKey {
  const s = String(row.status || 'OPEN').trim().toUpperCase();
  if (s === 'RESOLVE' || s === 'RESOLVED' || s === 'DONE') return 'RESOLVE';
  if (s === 'PENDING') return 'PENDING';
  return 'OPEN';
}

export const NONE_KEY = '__NONE__';

export function botKey(bot: string | null): string {
  return bot ? String(bot) : NONE_KEY;
}

export function botLabel(bot: string | null): string {
  if (!bot) return 'Tanpa bot';
  if (bot === 'META_IG') return 'IG';
  if (bot === 'META_FB') return 'FB';
  return String(bot);
}

const KATEGORI_LABEL: Record<string, string> = {
  CREATOR: 'Creator',
  SELLER: 'Seller',
  STAFF_VERIFICATION: 'Verifikasi',
  CS: 'CS',
};

const SUB_LABEL: Record<string, string> = {
  TIKTOK_SHOP: 'TikTok',
  TIKTOK: 'TikTok',
  SHOPEE: 'Shopee',
  YOUTUBE: 'YouTube',
  BARTER: 'Barter',
  ENDORSEMENT_CAMPAIGN_PARTNERSHIP: 'Endorsement',
  ADS_SSP_TSP: 'SSP/TSP',
};

export function jenisKey(category: string | null): string {
  return String(category || '').trim().toUpperCase() || NONE_KEY;
}

// Label rapi dari kategori + sub kategori. Data lama berisi string kosong, 'TIKTOK' (vs 'TIKTOK_SHOP'), dll.
export function jenisLabel(category: string | null, sub: string | null): string {
  const cat = String(category || '').trim().toUpperCase();
  const base = KATEGORI_LABEL[cat] || (category ? String(category) : '-');
  if (cat === 'STAFF_VERIFICATION') return base;
  const s = String(sub || '').trim();
  if (!s) return base;
  return base + ' · ' + (SUB_LABEL[s.toUpperCase()] || s);
}

export const JENIS_OPTIONS: { key: string; label: string }[] = [
  { key: 'CREATOR', label: 'Creator' },
  { key: 'SELLER', label: 'Seller' },
  { key: 'STAFF_VERIFICATION', label: 'Verifikasi' },
  { key: 'CS', label: 'CS' },
];

export const BOT_OPTIONS: { key: string; label: string }[] = [
  { key: '1052', label: '1052' },
  { key: '7484', label: '7484' },
  { key: 'META_IG', label: 'IG' },
  { key: NONE_KEY, label: 'Tanpa bot (lama)' },
];

/* --------------------------------- penerima --------------------------------- */

export interface NameInfo {
  nama: string;
  active: boolean;
  pool: string | null;
}
export type NameMap = Map<string, NameInfo>;

export function aliasTokens(assigned: string | null): string[] {
  return String(assigned || '')
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
}

export function buildNameMap(
  rows: { escalation_alias: string; display_name: string; pool: string | null; active: boolean | null }[]
): NameMap {
  const map: NameMap = new Map();
  for (const r of rows) {
    if (!r.escalation_alias) continue;
    map.set(String(r.escalation_alias).toUpperCase(), {
      nama: r.display_name,
      active: r.active !== false,
      pool: r.pool,
    });
  }
  return map;
}

export function penerimaLabel(assigned: string | null, names: NameMap): string {
  const toks = aliasTokens(assigned);
  if (toks.length === 0) return 'Belum ditugaskan';
  return toks.map((t) => names.get(t)?.nama || t).join(' & ');
}

/* ----------------------------------- waktu ----------------------------------- */

export function toMs(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

// Umur tiket terbuka (sekarang − masuk) atau durasi tiket selesai (selesai − masuk). null kalau datanya tak lengkap.
export function umurMs(row: EskalasiRow, now: number): number | null {
  const c = toMs(row.created_at);
  if (c === null) return null;
  if (statusOf(row) === 'RESOLVE') {
    const r = toMs(row.resolved_at);
    return r === null ? null : Math.max(0, r - c);
  }
  return Math.max(0, now - c);
}

export function formatDurasi(ms: number): string {
  const menit = Math.floor(Math.max(0, ms) / 60_000);
  if (menit < 1) return 'baru saja';
  if (menit < 60) return `${menit} mnt`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam`;
  return `${Math.floor(jam / 24)} hari`;
}

const wibDate = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric' });
const wibTime = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
const wibKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
const wibStampFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatWib(ms: number): { tanggal: string; jam: string } {
  const d = new Date(ms);
  return { tanggal: wibDate.format(d), jam: wibTime.format(d) };
}

// 'YYYY-MM-DD' menurut WIB (untuk filter rentang tanggal).
export function wibDateKey(ms: number): string {
  return wibKeyFmt.format(new Date(ms));
}

// 'YYYY-MM-DD HH:mm' menurut WIB (untuk CSV).
export function wibStamp(ms: number): string {
  return wibStampFmt.format(new Date(ms));
}

/* ----------------------------------- filter ----------------------------------- */

export type StatusFilter = StatusKey | 'ALL';
export type RentangFilter = 'ALL' | 'TODAY' | '7D' | '30D' | 'CUSTOM';

export interface FilterState {
  status: StatusFilter;
  penerima: string[]; // alias huruf besar, atau NONE_KEY = belum ditugaskan
  jenis: string; // 'ALL' atau kunci kategori
  bot: string; // 'ALL' atau kunci bot
  rentang: RentangFilter;
  dari: string; // YYYY-MM-DD (WIB), untuk CUSTOM
  sampai: string;
  umur: number; // 0 = semua; selain itu: hanya tiket belum selesai berumur >= N hari
  q: string;
}

export const DEFAULT_FILTER: FilterState = {
  status: 'OPEN',
  penerima: [],
  jenis: 'ALL',
  bot: 'ALL',
  rentang: 'ALL',
  dari: '',
  sampai: '',
  umur: 0,
  q: '',
};

export const UMUR_OPTIONS = [0, 1, 3, 7, 30];

function normNomor(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  return d;
}

function matchSearch(row: EskalasiRow, q: string, names: NameMap): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const digits = normNomor(s);
  if (digits.length >= 4 && String(row.nomor_wa || '').includes(digits)) return true;
  const hay = [row.nama, row.ticket_id, row.nomor_wa, row.assigned_to, penerimaLabel(row.assigned_to, names)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(s);
}

function matchRentang(row: EskalasiRow, f: FilterState, now: number): boolean {
  if (f.rentang === 'ALL') return true;
  const c = toMs(row.created_at);
  if (c === null) return false;
  const key = wibDateKey(c);
  if (f.rentang === 'TODAY') return key === wibDateKey(now);
  if (f.rentang === '7D') return key >= wibDateKey(now - 6 * DAY_MS);
  if (f.rentang === '30D') return key >= wibDateKey(now - 29 * DAY_MS);
  if (f.dari && key < f.dari) return false;
  if (f.sampai && key > f.sampai) return false;
  return true;
}

function matchPenerima(row: EskalasiRow, pilih: string[]): boolean {
  if (pilih.length === 0) return true;
  const toks = aliasTokens(row.assigned_to);
  if (toks.length === 0) return pilih.includes(NONE_KEY);
  const wanted = new Set(pilih.filter((p) => p !== NONE_KEY).map((p) => p.toUpperCase()));
  return toks.some((t) => wanted.has(t));
}

// `abaikanStatus` dipakai untuk menghitung angka di tombol status (tanpa terpengaruh status terpilih).
export function applyFilters(
  rows: EskalasiRow[],
  f: FilterState,
  now: number,
  names: NameMap,
  abaikanStatus = false
): EskalasiRow[] {
  return rows.filter((r) => {
    const st = statusOf(r);
    if (!abaikanStatus && f.status !== 'ALL' && st !== f.status) return false;
    if (f.jenis !== 'ALL' && jenisKey(r.category) !== f.jenis) return false;
    if (f.bot !== 'ALL' && botKey(r.bot_source) !== f.bot) return false;
    if (!matchPenerima(r, f.penerima)) return false;
    if (!matchRentang(r, f, now)) return false;
    if (f.umur > 0) {
      if (st === 'RESOLVE') return false;
      const u = umurMs(r, now);
      if (u === null || u < f.umur * DAY_MS) return false;
    }
    return matchSearch(r, f.q, names);
  });
}

export function hitungStatus(rows: EskalasiRow[], f: FilterState, now: number, names: NameMap) {
  const base = applyFilters(rows, f, now, names, true);
  const c = { OPEN: 0, PENDING: 0, RESOLVE: 0, ALL: base.length };
  for (const r of base) c[statusOf(r)] += 1;
  return c;
}

export function adaFilterAktif(f: FilterState): boolean {
  return (
    f.status !== DEFAULT_FILTER.status ||
    f.penerima.length > 0 ||
    f.jenis !== 'ALL' ||
    f.bot !== 'ALL' ||
    f.rentang !== 'ALL' ||
    f.umur > 0 ||
    f.q.trim() !== ''
  );
}

/* ------------------------------------ sort ------------------------------------ */

export type SortKey = 'masuk' | 'umur' | 'nama' | 'jenis' | 'penerima' | 'status' | 'selesai' | 'bot' | 'prioritas';
export interface SortSpec {
  key: SortKey | 'default';
  dir: 'asc' | 'desc';
}

// 'default' = tiket terbuka dulu, yang paling lama menunggu di atas; tiket selesai belakangan (terbaru di atas).
export const DEFAULT_SORT: SortSpec = { key: 'default', dir: 'asc' };

// Arah saat header pertama kali diklik
export const FIRST_DIR: Record<SortKey, 'asc' | 'desc'> = {
  masuk: 'desc',
  umur: 'desc',
  nama: 'asc',
  jenis: 'asc',
  penerima: 'asc',
  status: 'asc',
  selesai: 'desc',
  bot: 'asc',
  prioritas: 'asc',
};

const STATUS_RANK: Record<StatusKey, number> = { OPEN: 0, PENDING: 1, RESOLVE: 2 };
const PRIORITAS_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function cmpNum(a: number | null, b: number | null, dir: 'asc' | 'desc'): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // kosong selalu di bawah
  if (b === null) return -1;
  return dir === 'asc' ? a - b : b - a;
}

function cmpText(a: string, b: string, dir: 'asc' | 'desc'): number {
  const r = a.localeCompare(b, 'id');
  return dir === 'asc' ? r : -r;
}

export function sortRows(rows: EskalasiRow[], spec: SortSpec, now: number, names: NameMap): EskalasiRow[] {
  const created = (r: EskalasiRow) => toMs(r.created_at);
  const tieBreak = (a: EskalasiRow, b: EskalasiRow) =>
    cmpNum(created(a), created(b), 'asc') || a.ticket_id.localeCompare(b.ticket_id);

  const compare = (a: EskalasiRow, b: EskalasiRow): number => {
    const { key, dir } = spec;
    switch (key) {
      case 'default': {
        const ra = STATUS_RANK[statusOf(a)];
        const rb = STATUS_RANK[statusOf(b)];
        if (ra !== rb) return ra - rb;
        if (ra === STATUS_RANK.RESOLVE) {
          return cmpNum(toMs(a.resolved_at), toMs(b.resolved_at), 'desc') || cmpNum(created(a), created(b), 'desc');
        }
        return cmpNum(created(a), created(b), 'asc');
      }
      case 'masuk':
        return cmpNum(created(a), created(b), dir);
      case 'umur':
        return cmpNum(umurMs(a, now), umurMs(b, now), dir);
      case 'selesai':
        return cmpNum(toMs(a.resolved_at), toMs(b.resolved_at), dir);
      case 'status':
        return cmpNum(STATUS_RANK[statusOf(a)], STATUS_RANK[statusOf(b)], dir);
      case 'prioritas':
        return cmpNum(
          PRIORITAS_RANK[String(a.priority || '').toUpperCase()] ?? 3,
          PRIORITAS_RANK[String(b.priority || '').toUpperCase()] ?? 3,
          dir
        );
      case 'nama':
        return cmpText((a.nama || a.nomor_wa || '').toLowerCase(), (b.nama || b.nomor_wa || '').toLowerCase(), dir);
      case 'jenis':
        return cmpText(jenisLabel(a.category, a.sub_category), jenisLabel(b.category, b.sub_category), dir);
      case 'penerima': {
        // "Belum ditugaskan" dianggap kosong: selalu di bawah, apa pun arah urutnya
        const kosongA = aliasTokens(a.assigned_to).length === 0;
        const kosongB = aliasTokens(b.assigned_to).length === 0;
        if (kosongA || kosongB) return kosongA && kosongB ? 0 : kosongA ? 1 : -1;
        return cmpText(penerimaLabel(a.assigned_to, names), penerimaLabel(b.assigned_to, names), dir);
      }
      case 'bot':
        return cmpText(botLabel(a.bot_source), botLabel(b.bot_source), dir);
      default:
        return 0;
    }
  };

  return [...rows].sort((a, b) => compare(a, b) || tieBreak(a, b));
}

/* ----------------------------- ringkasan per penerima ----------------------------- */

export interface PenerimaSummary {
  key: string;
  label: string;
  tokens: string[]; // alias; kosong = belum ditugaskan
  open: number;
  tertuaMs: number;
}

// Hanya tiket berstatus Terbuka (Menunggu/IG punya tombol statusnya sendiri), dikelompokkan per isi assigned_to
// (pasangan seperti "RINTAN, RINTAN2" ikut sebagai satu kelompok).
export function ringkasPenerima(rows: EskalasiRow[], now: number, names: NameMap): PenerimaSummary[] {
  const map = new Map<string, PenerimaSummary>();
  for (const r of rows) {
    if (statusOf(r) !== 'OPEN') continue;
    const tokens = aliasTokens(r.assigned_to);
    const key = tokens.join(',') || NONE_KEY;
    let g = map.get(key);
    if (!g) {
      g = { key, label: penerimaLabel(r.assigned_to, names), tokens, open: 0, tertuaMs: 0 };
      map.set(key, g);
    }
    g.open += 1;
    const u = umurMs(r, now);
    if (u !== null && u > g.tertuaMs) g.tertuaMs = u;
  }
  return Array.from(map.values()).sort((a, b) => b.open - a.open || b.tertuaMs - a.tertuaMs);
}

/* ------------------------------------- CSV ------------------------------------- */

// Sel CSV aman: kutip bila perlu, dan awalan rumus (= + - @) dinetralkan agar tidak dieksekusi Excel/Sheets.
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// Nomor WA dipaksa teks (supaya tidak jadi 6.28E+11 di Excel); hanya untuk deretan angka murni.
function csvNomor(nomor: string): string {
  return /^\d{5,}$/.test(nomor) ? `="${nomor}"` : csvCell(nomor);
}

export function toCsv(rows: EskalasiRow[], now: number, names: NameMap): string {
  const head = [
    'Masuk (WIB)',
    'Umur atau durasi (jam)',
    'Nama',
    'Nomor WA',
    'Jenis',
    'Penerima',
    'Status',
    'Bot',
    'Prioritas',
    'Selesai (WIB)',
    'Tiket',
    'Catatan',
  ];
  const lines = [head.map(csvCell).join(',')];
  for (const r of rows) {
    const c = toMs(r.created_at);
    const rs = toMs(r.resolved_at);
    const u = umurMs(r, now);
    lines.push(
      [
        csvCell(c === null ? '' : wibStamp(c)),
        csvCell(u === null ? '' : (u / 3_600_000).toFixed(1)),
        csvCell(r.nama || ''),
        csvNomor(r.nomor_wa || ''),
        csvCell(jenisLabel(r.category, r.sub_category)),
        csvCell(penerimaLabel(r.assigned_to, names)),
        csvCell(STATUS_LABEL[statusOf(r)]),
        csvCell(botLabel(r.bot_source)),
        csvCell(r.priority || ''),
        csvCell(rs === null ? '' : wibStamp(rs)),
        csvCell(r.ticket_id),
        csvCell(r.customer_issue || r.data_notes || ''),
      ].join(',')
    );
  }
  return '\uFEFF' + lines.join('\r\n');
}

/* --------------------------------- state di URL --------------------------------- */

export const PAGE_SIZES = [25, 50, 100];

export interface ViewState {
  filter: FilterState;
  sort: SortSpec;
  page: number;
  size: number;
}

export const DEFAULT_VIEW: ViewState = { filter: DEFAULT_FILTER, sort: DEFAULT_SORT, page: 1, size: 25 };

const SORT_KEYS: SortKey[] = ['masuk', 'umur', 'nama', 'jenis', 'penerima', 'status', 'selesai', 'bot', 'prioritas'];
const STATUS_VALUES: StatusFilter[] = ['OPEN', 'PENDING', 'RESOLVE', 'ALL'];
const RENTANG_VALUES: RentangFilter[] = ['ALL', 'TODAY', '7D', '30D', 'CUSTOM'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Hanya nilai yang BEDA dari bawaan yang ditulis, supaya tautan tetap pendek.
export function buildQuery(v: ViewState): string {
  const p = new URLSearchParams();
  const f = v.filter;
  if (f.status !== DEFAULT_FILTER.status) p.set('status', f.status);
  if (f.penerima.length) p.set('penerima', f.penerima.join(','));
  if (f.jenis !== 'ALL') p.set('jenis', f.jenis);
  if (f.bot !== 'ALL') p.set('bot', f.bot);
  if (f.rentang !== 'ALL') p.set('rentang', f.rentang);
  if (f.rentang === 'CUSTOM') {
    if (f.dari) p.set('dari', f.dari);
    if (f.sampai) p.set('sampai', f.sampai);
  }
  if (f.umur > 0) p.set('umur', String(f.umur));
  if (f.q.trim()) p.set('q', f.q.trim());
  if (v.sort.key !== 'default') {
    p.set('sort', v.sort.key);
    p.set('dir', v.sort.dir);
  }
  if (v.page > 1) p.set('hal', String(v.page));
  if (v.size !== DEFAULT_VIEW.size) p.set('baris', String(v.size));
  return p.toString();
}

// Semua nilai divalidasi terhadap daftar yang diizinkan; yang tidak valid jatuh ke bawaan.
export function parseQuery(search: string): ViewState {
  const p = new URLSearchParams(search);
  const status = (p.get('status') || '').toUpperCase() as StatusFilter;
  const rentang = (p.get('rentang') || '').toUpperCase() as RentangFilter;
  const sortKey = (p.get('sort') || '') as SortKey;
  const umur = Number(p.get('umur'));
  const hal = Number(p.get('hal'));
  const baris = Number(p.get('baris'));
  const penerima = (p.get('penerima') || '')
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t === NONE_KEY || /^[A-Z0-9_]{1,40}$/.test(t))
    .slice(0, 20);
  const dari = p.get('dari') || '';
  const sampai = p.get('sampai') || '';
  const dir = p.get('dir') === 'asc' ? 'asc' : 'desc';

  return {
    filter: {
      status: STATUS_VALUES.includes(status) ? status : DEFAULT_FILTER.status,
      penerima,
      jenis: p.get('jenis') && p.get('jenis') !== 'ALL' ? String(p.get('jenis')).toUpperCase().slice(0, 40) : 'ALL',
      bot: p.get('bot') && p.get('bot') !== 'ALL' ? String(p.get('bot')).slice(0, 20) : 'ALL',
      rentang: RENTANG_VALUES.includes(rentang) ? rentang : 'ALL',
      dari: DATE_RE.test(dari) ? dari : '',
      sampai: DATE_RE.test(sampai) ? sampai : '',
      umur: UMUR_OPTIONS.includes(umur) ? umur : 0,
      q: (p.get('q') || '').slice(0, 80),
    },
    sort: SORT_KEYS.includes(sortKey) ? { key: sortKey, dir } : DEFAULT_SORT,
    page: Number.isInteger(hal) && hal >= 1 ? hal : 1,
    size: PAGE_SIZES.includes(baris) ? baris : DEFAULT_VIEW.size,
  };
}

/* ----------------------------------- kolom ----------------------------------- */

export type ColumnKey = 'masuk' | 'umur' | 'nama' | 'jenis' | 'penerima' | 'status' | 'selesai' | 'bot' | 'prioritas' | 'tiket';

export const COLUMN_DEFS: { key: ColumnKey; label: string; sortKey: SortKey | null; defaultOn: boolean }[] = [
  { key: 'masuk', label: 'Masuk', sortKey: 'masuk', defaultOn: true },
  { key: 'umur', label: 'Umur / durasi', sortKey: 'umur', defaultOn: true },
  { key: 'nama', label: 'Customer', sortKey: 'nama', defaultOn: true },
  { key: 'jenis', label: 'Jenis', sortKey: 'jenis', defaultOn: true },
  { key: 'penerima', label: 'Penerima', sortKey: 'penerima', defaultOn: true },
  { key: 'status', label: 'Status', sortKey: 'status', defaultOn: true },
  { key: 'selesai', label: 'Selesai', sortKey: 'selesai', defaultOn: true },
  { key: 'bot', label: 'Bot', sortKey: 'bot', defaultOn: true },
  { key: 'prioritas', label: 'Prioritas', sortKey: 'prioritas', defaultOn: false },
  { key: 'tiket', label: 'ID tiket', sortKey: null, defaultOn: false },
];

export function defaultColumns(): ColumnKey[] {
  return COLUMN_DEFS.filter((c) => c.defaultOn).map((c) => c.key);
}

// Hanya kunci yang dikenal yang diterima dari localStorage.
export function sanitizeColumns(raw: unknown): ColumnKey[] {
  if (!Array.isArray(raw)) return defaultColumns();
  const known = new Set(COLUMN_DEFS.map((c) => c.key));
  const out = COLUMN_DEFS.map((c) => c.key).filter((k) => raw.includes(k) && known.has(k));
  return out.length > 0 ? out : defaultColumns();
}

/* --------------------------------- paginasi --------------------------------- */

// 1 … 4 5 6 … 24  (halaman pertama, terakhir, dan sekitar halaman aktif)
export function buildPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, current - 1, current, current + 1]);
  const sorted = Array.from(set)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}
