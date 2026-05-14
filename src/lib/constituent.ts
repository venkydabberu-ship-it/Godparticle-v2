import { supabase, callEdge } from './supabase';

const STORAGE_KEY = 'gp_constituent_fetch_date';

// Returns the most recent completed trading day's date string (YYYY-MM-DD) in IST.
function lastTradingDay(): string {
  const now = new Date();
  // IST = UTC + 5:30
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const hour = ist.getUTCHours();
  const minute = ist.getUTCMinutes();
  const dow = ist.getUTCDay(); // 0=Sun, 6=Sat

  // Market closes 3:30 PM IST. Use 3:45 PM as the safe cutoff.
  const marketClosed = hour > 15 || (hour === 15 && minute >= 45);

  // Walk back to find the last completed trading day
  const target = new Date(ist);
  if (!marketClosed) {
    // Before today's close — use yesterday
    target.setUTCDate(target.getUTCDate() - 1);
  }
  // Skip backwards over weekends
  while (target.getUTCDay() === 0 || target.getUTCDay() === 6) {
    target.setUTCDate(target.getUTCDate() - 1);
  }
  return target.toISOString().split('T')[0];
}

// Called once per authenticated session.
// Silently fetches constituent stock data for the latest trading day if missing.
// Uses localStorage to ensure it only runs once per device per trading day.
export async function ensureConstituentDataFetched(): Promise<void> {
  try {
    const targetDate = lastTradingDay();

    // Already fetched today on this device — skip
    if (localStorage.getItem(STORAGE_KEY) === targetDate) return;

    // Check if DB already has data for this date (another device may have fetched it)
    const { count } = await supabase
      .from('constituent_daily_data')
      .select('*', { count: 'exact', head: true })
      .eq('trade_date', targetDate);

    if (count && count > 0) {
      localStorage.setItem(STORAGE_KEY, targetDate);
      return;
    }

    // Data missing — trigger the edge function silently in background
    await callEdge('fetch-constituent-data', { date: targetDate });
    localStorage.setItem(STORAGE_KEY, targetDate);
  } catch {
    // Silent fail — never block the UI for background data collection
  }
}
