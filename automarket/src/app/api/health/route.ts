import { NextResponse } from 'next/server';

export async function GET() {
  const vars = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'MISSING',
    SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'SET' : 'MISSING',
  };

  const allOk = Object.values(vars).every(v => v === 'SET') ||
    (vars.NEXT_PUBLIC_SUPABASE_URL === 'SET' || vars.SUPABASE_URL === 'SET') &&
    vars.SUPABASE_SERVICE_ROLE_KEY === 'SET' &&
    vars.ANTHROPIC_API_KEY === 'SET';

  return NextResponse.json({ ok: allOk, vars });
}
