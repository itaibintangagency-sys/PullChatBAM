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


export interface BotToggleLog {
  id: string;
  action: 'ON' | 'OFF';
  triggered_by: string | null;
  status: 'success' | 'failed';
  api_response: string | null;
  created_at: string;
}

export interface StaffProfile {
  id: string;
  display_name: string;
  role: 'admin' | 'staff'; // TODO: tambah 'm_level' nanti pas role itu dirilis
}

export interface L0Config {
  id: string;
  variable_key: string;
  display_name: string;
  nomor_wa: string;
  peran: string | null;
  category: string | null;
  peran_notif: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Escalation {
  id: string;
  ticket_id: string;
  created_at: string;
  bot_source: string;
  nomor_wa: string;
  nama: string | null;
  category: string | null;
  sub_category: string | null;
  escalation_type: string | null;
  assigned_to: string | null;
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | string | null;
  store_link: string | null;
  data_notes: string | null;
  customer_issue: string | null;
  notes: string | null;
  status: 'OPEN' | 'RESOLVED' | string;
  staff_contacted_at: string | null;
  resolution: string | null;
  resolved_at: string | null;
  resolution_time: string | null;
  locked_by: string | null;
  locked_at: string | null;
}

export interface BlacklistEntry {
  id: string;
  nomor_wa: string;
  bot_source: string;
  detected_at: string;
  reason: string | null;
  original_message: string | null;
}
 
export interface DormantEntry {
  id: string;
  nomor_wa: string;
  bot_source: string;
  source: string; // 'HANDOFF' atau 'BUNTU_9X'
  ticket_id: string | null;
  logged_at: string;
  dormant_until: string | null;
  fu_count: number;
  status: string; // 'PENDING' | 'RESOLVED'
  notified_cs_bintang: boolean;
}

export interface BotDecisionLog {
  id: string;
  bot_source: string;
  logged_at: string;
  nomor_wa: string;
  nama_brand: string | null;
  category: string | null;
  sub_category: string | null;
  stage_at_log: string | null;
  stage_prev: string | null;
  stage_next: string | null;
  outcome: string | null;
  trigger_eskalasi: string | null;
  store_link: string | null;
  vision_check_result: string | null;
  context_summary: string | null;
  pesan_customer: string | null;
  balasan_bot: string | null;
  assigned_to: string | null;
  routed_at: string | null;
  status_cs: string | null;
  created_at: string;
}
