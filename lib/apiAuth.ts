import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface StaffCaller {
  userId: string;
  displayName: string;
  role: string;
}

// Memastikan pemanggil adalah staf yang login (token Supabase di header Authorization). Mengembalikan respons error bila tidak.
export async function authenticateStaff(request: NextRequest): Promise<StaffCaller | NextResponse> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const token = authHeader.replace('Bearer ', '');

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await callerClient
    .from('staff_profiles')
    .select('display_name, role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: 'Hanya staf yang boleh memakai fitur ini' }, { status: 403 });

  return {
    userId: userData.user.id,
    displayName: profile.display_name || userData.user.email || 'Staf web',
    role: profile.role,
  };
}
