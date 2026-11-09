-- Daftar chat: satu baris per kontak (percakapan terbaru), dihitung di database.
-- Tanpa ini halaman Chat log hanya melihat 1000 baris terbaru, sehingga satu nomor yang spam
-- (mis. bot operator yang saling balas) menyembunyikan semua kontak lain.
-- security_invoker: RLS chat_logs tetap berlaku untuk pengguna yang membaca.
create index if not exists idx_chat_logs_session_nomor_ts on public.chat_logs (session, nomor_wa, "timestamp" desc);

create or replace view public.chat_list_summary with (security_invoker = true) as
select distinct on (c.session, c.nomor_wa)
  c.session,
  c.nomor_wa,
  coalesce(
    c.nama,
    (select c2.nama from public.chat_logs c2
      where c2.session = c.session and c2.nomor_wa = c.nomor_wa and c2.nama is not null
      order by c2."timestamp" desc limit 1)
  ) as nama,
  c.message_text,
  c."timestamp" as last_timestamp
from public.chat_logs c
order by c.session, c.nomor_wa, c."timestamp" desc;

grant select on public.chat_list_summary to authenticated;
