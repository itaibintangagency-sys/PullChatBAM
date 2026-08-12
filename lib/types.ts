export type Nomor = '7484' | '1052';

export const NOMOR_LABELS: Record<Nomor, string> = {
  '7484': 'Nomor 7484 (0812647484)',
  '1052': 'Nomor 1052 (089526861052)',
};

export interface ChatLog {
  id: string;
  timestamp: string;
  session: string;
  nomor_wa: string;
  nama: string | null;
  sender: 'CUSTOMER' | 'CS';
  message_type: string;
  message_text: string | null;
  media_url: string | null;
  message_id: string | null;
  source: 'realtime' | 'historical';
  created_at: string;
}

export interface ChatSummary {
  nomor_wa: string;
  nama: string | null;
  session: string;
  last_message: string;
  last_timestamp: string;
  is_internal: boolean;
}

export interface InternalNumber {
  id: string;
  nomor_wa: string;
  label: string;
  keterangan: string | null;
  created_at: string;
}

export interface ReviewForm {
  id: string;
  submitted_by: string;
  nomor_bind: Nomor;
  tanggal: string;
  skor_teknikal: number;
  skor_handoff: number;
  skor_completion: number;
  skor_volume: number;
  skor_cs_handling: number;
  skor_kepuasan_umum: number;
  catatan: string | null;
  created_at: string;
}

export interface StaffProfile {
  id: string;
  display_name: string;
  role: 'admin' | 'staff';
}

export interface BotToggleLog {
  id: string;
  action: 'ON' | 'OFF';
  triggered_by: string | null;
  status: 'success' | 'failed';
  api_response: string | null;
  created_at: string;
}
