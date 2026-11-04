import { redirect } from 'next/navigation';

// Form review harian sudah tidak dipakai; halamannya diganti dashboard Feedback chatbot.
// Redirect ini menjaga bookmark/tautan lama tetap jalan.
export default async function ReviewRedirectPage({ params }: { params: Promise<{ nomor: string }> }) {
  const { nomor } = await params;
  redirect(`/${nomor}/feedback`);
}
