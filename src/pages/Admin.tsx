import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { runDailyAutoFetch, autoFetchAllStocksData, autoFetchAllFundamentals } from '../lib/autofetch';

const DEFAULT_INDICES = [
  { key: 'NIFTY50', name: 'Nifty 50', exchange: 'NSE', expiry: 'weekly', upstoxKey: 'NSE_INDEX|Nifty 50', color: '#f0c040' },
  { key: 'SENSEX', name: 'Sensex', exchange: 'BSE', expiry: 'weekly', upstoxKey: 'BSE_INDEX|SENSEX', color: '#4d9fff' },
  { key: 'BANKNIFTY', name: 'Bank Nifty', exchange: 'NSE', expiry: 'monthly', upstoxKey: 'NSE_INDEX|Nifty Bank', color: '#39d98a' },
  { key: 'FINNIFTY', name: 'Fin Nifty', exchange: 'NSE', expiry: 'monthly', upstoxKey: 'NSE_INDEX|Nifty Fin Service', color: '#a78bfa' },
  { key: 'MIDCAPNIFTY', name: 'Midcap Nifty', exchange: 'NSE', expiry: 'monthly', upstoxKey: 'NSE_INDEX|Nifty Midcap Select', color: '#ff8c42' },
  { key: 'NIFTYNEXT50', name: 'Nifty Next 50', exchange: 'NSE', expiry: 'monthly', upstoxKey: 'NSE_INDEX|Nifty Next 50', color: '#ff4d6d' },
  { key: 'BANKEX', name: 'Bankex', exchange: 'BSE', expiry: 'monthly', upstoxKey: 'BSE_INDEX|BANKEX', color: '#39d98a' },
];

const DEFAULT_SECTORS = [
  { name: 'Banking', emoji: '🏦', color: '#4d9fff', stocks: ['HDFCBANK', 'SBIN', 'ICICIBANK', 'KOTAKBANK', 'AXISBANK'] },
  { name: 'IT', emoji: '💻', color: '#39d98a', stocks: ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM'] },
  { name: 'Auto', emoji: '🚗', color: '#f0c040', stocks: ['MARUTI', 'TATAMOTORS', 'M&M', 'BAJAJ-AUTO', 'HEROMOTOCO'] },
  { name: 'Pharma', emoji: '💊', color: '#a78bfa', stocks: ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'APOLLOHOSP'] },
  { name: 'FMCG', emoji: '🛒', color: '#ff8c42', stocks: ['HINDUNILVR', 'ITC', 'NESTLEIND', 'BRITANNIA', 'DABUR'] },
  { name: 'Energy', emoji: '⛽', color: '#ff4d6d', stocks: ['RELIANCE', 'ONGC', 'IOC', 'BPCL', 'GAIL'] },
  { name: 'Defence', emoji: '🛡', color: '#39d98a', stocks: ['HAL', 'BEL', 'BHEL', 'NTPC', 'POWERGRID'] },
  { name: 'Metals', emoji: '⚙', color: '#6b6b85', stocks: ['TATASTEEL', 'HINDALCO', 'JSWSTEEL', 'VEDL', 'COALINDIA'] },
  { name: 'Realty', emoji: '🏠', color: '#f0c040', stocks: ['DLF', 'GODREJPROP', 'OBEROIRLTY', 'PRESTIGE', 'PHOENIXLTD'] },
  { name: 'Conglomerate', emoji: '🏢', color: '#4d9fff', stocks: ['ADANIENT', 'BAJFINANCE', 'LT', 'SIEMENS', 'ADANIPORTS'] },
];

export default function Admin() {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState<any[]>([]);
  const [queries, setQueries] = useState<any[]>([]);
  const [searchUser, setSearchUser] = useState('');
  const [grantUserId, setGrantUserId] = useState('');
  const [grantCredits, setGrantCredits] = useState('');
  const [grantMsg, setGrantMsg] = useState('');
  const [changeRoleUserId, setChangeRoleUserId] = useState('');
  const [changeRole, setChangeRole] = useState('');
  const [roleMsg, setRoleMsg] = useState('');
  const [subscriberCount, setSubscriberCount] = useState('2600+');
  const [announcement, setAnnouncement] = useState('');
  const [settingsMsg, setSettingsMsg] = useState('');
  const [stats, setStats] = useState<any>({});
  const [queryFilter, setQueryFilter] = useState('All');
  const [uploadingAnswer, setUploadingAnswer] = useState<string | null>(null);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchResults, setFetchResults] = useState<any[]>([]);
  const [fetchDone, setFetchDone] = useState(false);
  const [fetchStocksLoading, setFetchStocksLoading] = useState(false);
  const [fetchStocksResults, setFetchStocksResults] = useState<any[]>([]);
  const [fetchStocksDone, setFetchStocksDone] = useState(false);
  const [fetchFundLoading, setFetchFundLoading] = useState(false);
  const [fetchFundResults, setFetchFundResults] = useState<any[]>([]);
  const [fetchFundDone, setFetchFundDone] = useState(false);
  const [indices, setIndices] = useState(DEFAULT_INDICES);
  const [sectors, setSectors] = useState(DEFAULT_SECTORS);
  const [newIndexKey, setNewIndexKey] = useState('');
  const [newIndexName, setNewIndexName] = useState('');
  const [newIndexExchange, setNewIndexExchange] = useState('NSE');
  const [newIndexExpiry, setNewIndexExpiry] = useState('monthly');
  const [newIndexUpstox, setNewIndexUpstox] = useState('');
  const [showAddIndex, setShowAddIndex] = useState(false);
  const [addStockSector, setAddStockSector] = useState('');
  const [addStockName, setAddStockName] = useState('');
  const [dbData, setDbData] = useState<any[]>([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbFilter, setDbFilter] = useState('ALL');
  const [dbSearch, setDbSearch] = useState('');
  const [dbDateFilter, setDbDateFilter] = useState('');
  const [dbStats, setDbStats] = useState<any>({});
  const [deleteMsg, setDeleteMsg] = useState('');
  const [dbSubTab, setDbSubTab] = useState<'options' | 'prices' | 'fundamentals'>('options');
  const [dbPriceData, setDbPriceData] = useState<any[]>([]);
  const [dbPriceLoading, setDbPriceLoading] = useState(false);
  const [dbPriceStats, setDbPriceStats] = useState<any>({});
  const [dbFundData, setDbFundData] = useState<any[]>([]);
  const [dbFundLoading, setDbFundLoading] = useState(false);
  const [dbFundStats, setDbFundStats] = useState<any>({});

  useEffect(() => {
    if (profile?.role !== 'admin') return;
    loadAll();
    loadAutoFetchConfig();
  }, [profile]);

  useEffect(() => {
    if (activeTab !== 'databank') return;
    if (dbSubTab === 'options') loadDataBank();
    else if (dbSubTab === 'prices') loadStockPrices();
    else if (dbSubTab === 'fundamentals') loadFundamentals();
  }, [activeTab, dbSubTab, dbFilter, dbSearch, dbDateFilter]);

  async function loadDataBank() {
    setDbLoading(true);
    try {
      let query = supabase
        .from('market_data')
        .select('id, index_name, expiry, trade_date, uploaded_by, category, timeframe, created_at, strike_data')
        .order('created_at', { ascending: false })
        .limit(200);

      if (dbFilter === 'AUTO') query = query.eq('uploaded_by', 'auto-fetch');
      else if (dbFilter === 'MANUAL') query = query.neq('uploaded_by', 'auto-fetch');
      else if (dbFilter === 'STOCKS') query = query.eq('category', 'stock');
      else if (dbFilter === 'INDICES') query = query.eq('category', 'index');
      if (dbSearch) query = query.ilike('index_name', `%${dbSearch}%`);
      if (dbDateFilter) query = query.eq('trade_date', dbDateFilter);

      const { data, error } = await query;
      if (error) throw error;

      const enriched = (data || []).map(row => ({
        ...row,
        strikeCount: row.strike_data ? Object.keys(row.strike_data).length : 0,
      }));
      setDbData(enriched);

      const { count: total } = await supabase.from('market_data').select('*', { count: 'exact', head: true });
      const { count: autoCount } = await supabase.from('market_data').select('*', { count: 'exact', head: true }).eq('uploaded_by', 'auto-fetch');
      const { count: indexCount } = await supabase.from('market_data').select('*', { count: 'exact', head: true }).eq('category', 'index');
      const { count: stockCount } = await supabase.from('market_data').select('*', { count: 'exact', head: true }).eq('category', 'stock');

      setDbStats({
        total: total || 0,
        auto: autoCount || 0,
        manual: (total || 0) - (autoCount || 0),
        indices: indexCount || 0,
        stocks: stockCount || 0,
      });
    } catch (err: any) {
      console.error('loadDataBank error:', err);
    } finally {
      setDbLoading(false);
    }
  }

  async function loadStockPrices() {
    setDbPriceLoading(true);
    try {
      let query = supabase
        .from('stock_price_data')
        .select('id, stock_name, trade_date, open, high, low, close, volume, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (dbSearch) query = query.ilike('stock_name', `%${dbSearch}%`);
      if (dbDateFilter) query = query.eq('trade_date', dbDateFilter);

      const { data, error } = await query;
      if (error) throw error;
      setDbPriceData(data || []);

      const { count: total } = await supabase.from('stock_price_data').select('*', { count: 'exact', head: true });
      const { count: uniqueStocks } = await supabase.from('stock_price_data').select('stock_name', { count: 'exact', head: true });
      setDbPriceStats({ total: total || 0, stocks: uniqueStocks || 0 });
    } catch (err: any) {
      console.error('loadStockPrices error:', err);
    } finally {
      setDbPriceLoading(false);
    }
  }

  async function loadFundamentals() {
    setDbFundLoading(true);
    try {
      let query = supabase
        .from('stock_fundamentals')
        .select('id, stock_name, trade_date, pe_ratio, eps, book_value, face_value, market_cap, week52_high, week52_low, dividend_yield, roce, ltp, sector, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (dbSearch) query = query.ilike('stock_name', `%${dbSearch}%`);
      if (dbDateFilter) query = query.eq('trade_date', dbDateFilter);

      const { data, error } = await query;
      if (error) throw error;
      setDbFundData(data || []);

      const { count: total } = await supabase.from('stock_fundamentals').select('*', { count: 'exact', head: true });
      setDbFundStats({ total: total || 0 });
    } catch (err: any) {
      console.error('loadFundamentals error:', err);
    } finally {
      setDbFundLoading(false);
    }
  }

  async function handleDeleteRow(id: string) {
    const { error } = await supabase.from('market_data').delete().eq('id', id);
    if (error) { setDeleteMsg(`Error: ${error.message}`); return; }
    setDeleteMsg('Deleted!');
    setTimeout(() => setDeleteMsg(''), 2000);
    loadDataBank();
  }

  async function loadAll() {
    const { data: usersData } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (usersData) setUsers(usersData);
    const { data: queriesData } = await supabase.from('customer_queries').select('*').order('created_at', { ascending: false });
    if (queriesData) setQueries(queriesData);
    const { data: settingsData } = await supabase.from('admin_settings').select('*');
    if (settingsData) {
      settingsData.forEach(s => {
        if (s.key === 'subscriber_count') setSubscriberCount(s.value);
        if (s.key === 'announcement') setAnnouncement(s.value);
      });
    }
    const { data: analysesData } = await supabase.from('analyses').select('id');
    setStats({
      totalUsers: usersData?.length ?? 0,
      freeUsers: usersData?.filter(u => u.role === 'free').length ?? 0,
      basicUsers: usersData?.filter(u => u.role === 'basic').length ?? 0,
      premiumUsers: usersData?.filter(u => u.role === 'premium').length ?? 0,
      proUsers: usersData?.filter(u => u.role === 'pro').length ?? 0,
      totalAnalyses: analysesData?.length ?? 0,
      pendingQueries: queriesData?.filter((q: any) => q.status === 'Pending').length ?? 0,
    });
  }

  async function loadAutoFetchConfig() {
    const { data } = await supabase.from('admin_settings').select('*').in('key', ['autofetch_indices', 'autofetch_sectors']);
    if (data) {
      data.forEach(s => {
        if (s.key === 'autofetch_indices') { try { setIndices(JSON.parse(s.value)); } catch {} }
        if (s.key === 'autofetch_sectors') { try { setSectors(JSON.parse(s.value)); } catch {} }
      });
    }
  }

  async function saveAutoFetchConfig(newIndices: any[], newSectors: any[]) {
    await supabase.from('admin_settings').upsert({ key: 'autofetch_indices', value: JSON.stringify(newIndices) });
    await supabase.from('admin_settings').upsert({ key: 'autofetch_sectors', value: JSON.stringify(newSectors) });
  }

  function handleRemoveIndex(key: string) {
    const updated = indices.filter(i => i.key !== key);
    setIndices(updated);
    saveAutoFetchConfig(updated, sectors);
  }

  function handleAddIndex() {
    if (!newIndexKey || !newIndexName || !newIndexUpstox) return;
    const newIdx = { key: newIndexKey.toUpperCase(), name: newIndexName, exchange: newIndexExchange, expiry: newIndexExpiry, upstoxKey: newIndexUpstox, color: '#f0c040' };
    const updated = [...indices, newIdx];
    setIndices(updated);
    saveAutoFetchConfig(updated, sectors);
    setNewIndexKey(''); setNewIndexName(''); setNewIndexUpstox('');
    setShowAddIndex(false);
  }

  function handleRemoveStock(sectorName: string, stock: string) {
    const updated = sectors.map(s => s.name === sectorName ? { ...s, stocks: s.stocks.filter((st: string) => st !== stock) } : s);
    setSectors(updated);
    saveAutoFetchConfig(indices, updated);
  }

  function handleAddStock() {
    if (!addStockSector || !addStockName) return;
    const updated = sectors.map(s => s.name === addStockSector ? { ...s, stocks: [...s.stocks, addStockName.toUpperCase()] } : s);
    setSectors(updated);
    saveAutoFetchConfig(indices, updated);
    setAddStockName(''); setAddStockSector('');
  }

  async function handleGrantCredits() {
    if (!grantUserId || !grantCredits) { setGrantMsg('Select user and enter credits!'); return; }
    const { error } = await supabase.from('profiles').update({ credits: parseInt(grantCredits) }).eq('id', grantUserId);
    if (error) { setGrantMsg(`Error: ${error.message}`); return; }
    setGrantMsg('Credits updated!');
    loadAll();
  }

  async function handleChangeRole() {
    if (!changeRoleUserId || !changeRole) { setRoleMsg('Select user and role!'); return; }
    const { error } = await supabase.from('profiles').update({ role: changeRole }).eq('id', changeRoleUserId);
    if (error) { setRoleMsg(`Error: ${error.message}`); return; }
    setRoleMsg(`Role updated to ${changeRole.toUpperCase()}!`);
    setTimeout(() => setRoleMsg(''), 3000);
    loadAll();
  }

  async function handleSaveSettings() {
    await supabase.from('admin_settings').upsert({ key: 'subscriber_count', value: subscriberCount });
    await supabase.from('admin_settings').upsert({ key: 'announcement', value: announcement });
    setSettingsMsg('Settings saved!');
    setTimeout(() => setSettingsMsg(''), 3000);
  }

  async function handleDownloadQueries() {
    const filtered = queryFilter === 'All' ? queries : queries.filter(q => q.status === queryFilter);
    let content = 'GOD PARTICLE QUERIES\n\n';
    filtered.forEach((q, i) => {
      content += `QUERY #${i + 1}\n${q.username} | ${q.plan} | ${q.status}\n${q.query_text}\n\n`;
    });
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `queries_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleUploadAnswer(queryId: string, file: File) {
    setUploadingAnswer(queryId);
    try {
      const fileName = `answers/${queryId}_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage.from('query-answers').upload(fileName, file, { contentType: 'application/pdf' });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('query-answers').getPublicUrl(fileName);
      await supabase.from('customer_queries').update({ status: 'Answered', answer_pdf_url: urlData.publicUrl }).eq('id', queryId);
      loadAll();
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploadingAnswer(null);
    }
  }

  async function handleAutoFetch() {
    if (!user) return;
    setFetchLoading(true);
    setFetchDone(false);
    setFetchResults([]);
    try {
      const res = await runDailyAutoFetch(user.id);
      setFetchResults(res);
      setFetchDone(true);
    } catch (err: any) {
      setFetchResults([{ status: 'error', error: err.message }]);
      setFetchDone(true);
    } finally {
      setFetchLoading(false);
    }
  }

  async function handleFetchStocksData() {
    setFetchStocksLoading(true);
    setFetchStocksDone(false);
    setFetchStocksResults([]);
    try {
      const res = await autoFetchAllStocksData();
      setFetchStocksResults(res);
      setFetchStocksDone(true);
    } catch (err: any) {
      setFetchStocksResults([{ status: 'error', error: err.message }]);
      setFetchStocksDone(true);
    } finally {
      setFetchStocksLoading(false);
    }
  }

  async function handleFetchFundamentals() {
    setFetchFundLoading(true);
    setFetchFundDone(false);
    setFetchFundResults([]);
    try {
      const res = await autoFetchAllFundamentals();
      setFetchFundResults(res);
      setFetchFundDone(true);
    } catch (err: any) {
      setFetchFundResults([{ status: 'error', error: err.message }]);
      setFetchFundDone(true);
    } finally {
      setFetchFundLoading(false);
    }
  }

  if (profile?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-[#e8e8f0]">
        <div className="text-center">
          <div className="text-4xl mb-4">🚫</div>
          <div className="font-black text-xl mb-2">Access Denied</div>
          <Link to="/dashboard" className="text-[#f0c040] text-sm">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const tabs = ['overview', 'users', 'databank', 'queries', 'autofetch', 'settings'];
  const tabLabels = ['Overview', 'Users', 'Data Bank', 'Queries', 'Auto Fetch', 'Settings'];
  const filteredQueries = queryFilter === 'All' ? queries : queries.filter(q => q.status === queryFilter);
  const roleColors: Record<string, string> = {
    admin: 'bg-[#ff4d6d]/15 text-[#ff4d6d]',
    pro: 'bg-[#4d9fff]/15 text-[#4d9fff]',
    premium: 'bg-[#39d98a]/15 text-[#39d98a]',
    basic: 'bg-[#f0c040]/15 text-[#f0c040]',
    free: 'bg-[#6b6b85]/15 text-[#6b6b85]'
  };
  const weeklyIndices = indices.filter(i => i.expiry === 'weekly');
  const monthlyIndices = indices.filter(i => i.expiry === 'monthly');
  const totalStocks = sectors.reduce((sum, s) => sum + s.stocks.length, 0);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg">⚛</div>
          <div>
            <div className="font-bold text-base">God Particle</div>
            <div className="text-[10px] font-mono text-[#f0c040]">ADMIN PANEL</div>
          </div>
        </div>
        <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">← Dashboard</Link>
      </nav>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">
        <div className="flex gap-1 bg-[#111118] rounded-xl p-1 mb-6 overflow-x-auto">
          {tabs.map((t, i) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${activeTab === t ? 'bg-[#16161f] text-[#e8e8f0] border border-[#1e1e2e]' : 'text-[#6b6b85]'}`}>
              {tabLabels[i]}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div>
            <h2 className="text-base font-black mb-6">Platform Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Total Users', value: stats.totalUsers, color: '#f0c040' },
                { label: 'Free Users', value: stats.freeUsers, color: '#6b6b85' },
                { label: 'Basic Users', value: stats.basicUsers, color: '#f0c040' },
                { label: 'Premium Users', value: stats.premiumUsers, color: '#39d98a' },
                { label: 'Pro Users', value: stats.proUsers, color: '#4d9fff' },
                { label: 'Total Analyses', value: stats.totalAnalyses, color: '#ff4d6d' },
                { label: 'Pending Queries', value: stats.pendingQueries, color: '#f0c040' },
                { label: 'Revenue Est.', value: `Rs.${((stats.basicUsers ?? 0) * 100 + (stats.premiumUsers ?? 0) * 300 + (stats.proUsers ?? 0) * 2500).toLocaleString()}`, color: '#39d98a' },
              ].map((s, i) => (
                <div key={i} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
                  <div className="text-xs font-mono text-[#6b6b85] mb-1">{s.label}</div>
                  <div className="text-xl font-black" style={{ color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div>
            <h2 className="text-base font-black mb-6">User Management</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
                <div className="text-sm font-black mb-4 text-[#f0c040]">Grant Credits</div>
                <div className="space-y-3">
                  <select value={grantUserId} onChange={e => setGrantUserId(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none">
                    <option value="">Select user...</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}
                  </select>
                  <input type="number" value={grantCredits} onChange={e => setGrantCredits(e.target.value)}
                    placeholder="Credits to grant"
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none" />
                  <button onClick={handleGrantCredits}
                    className="w-full bg-[#f0c040] text-black font-black text-xs py-2.5 rounded-xl">
                    Grant Credits
                  </button>
                  {grantMsg && <div className="text-xs font-mono text-[#39d98a]">{grantMsg}</div>}
                </div>
              </div>
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
                <div className="text-sm font-black mb-4 text-[#4d9fff]">Change Role</div>
                <div className="space-y-3">
                  <select value={changeRoleUserId} onChange={e => setChangeRoleUserId(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none">
                    <option value="">Select user...</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}
                  </select>
                  <select value={changeRole} onChange={e => setChangeRole(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none">
                    <option value="">Select role...</option>
                    <option value="free">Free</option>
                    <option value="basic">Basic</option>
                    <option value="premium">Premium</option>
                    <option value="pro">Pro</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button onClick={handleChangeRole}
                    className="w-full bg-[#4d9fff] text-black font-black text-xs py-2.5 rounded-xl">
                    Change Role
                  </button>
                  {roleMsg && <div className="text-xs font-mono text-[#39d98a]">{roleMsg}</div>}
                </div>
              </div>
            </div>
            <input type="text" value={searchUser} onChange={e => setSearchUser(e.target.value)}
              placeholder="Search by username..."
              className="w-full bg-[#111118] border border-[#1e1e2e] rounded-xl px-4 py-3 text-sm font-mono text-[#e8e8f0] outline-none mb-4" />
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead><tr className="border-b border-[#1e1e2e]">
                  {['Username', 'Role', 'Credits', 'Status', 'Joined', 'Change'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[#6b6b85] uppercase font-normal">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {users.filter(u => !searchUser || u.username?.toLowerCase().includes(searchUser.toLowerCase())).map((u, i) => (
                    <tr key={i} className="border-b border-[#1e1e2e]/50">
                      <td className="px-4 py-3 font-bold">{u.username}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-bold ${roleColors[u.role] || roleColors.free}`}>{u.role?.toUpperCase()}</span></td>
                      <td className="px-4 py-3 text-[#f0c040] font-bold">{u.credits?.toLocaleString()}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-bold ${u.is_active ? 'bg-[#39d98a]/15 text-[#39d98a]' : 'bg-[#ff4d6d]/15 text-[#ff4d6d]'}`}>{u.is_active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                      <td className="px-4 py-3 text-[#6b6b85]">{new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                      <td className="px-4 py-3">
                        <select defaultValue="" onChange={async (e) => { if (!e.target.value) return; await supabase.from('profiles').update({ role: e.target.value }).eq('id', u.id); loadAll(); e.target.value = ''; }}
                          className="bg-[#16161f] border border-[#1e1e2e] rounded px-2 py-1 text-xs font-mono text-[#e8e8f0] outline-none">
                          <option value="">Change...</option>
                          <option value="free">Free</option>
                          <option value="basic">Basic</option>
                          <option value="premium">Premium</option>
                          <option value="pro">Pro</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'databank' && (
          <div>
            <h2 className="text-base font-black mb-4">Data Bank</h2>

            {/* Sub-tabs */}
            <div className="flex gap-1 bg-[#0a0a0f] rounded-xl p-1 mb-6 w-fit">
              {(['options', 'prices', 'fundamentals'] as const).map(tab => (
                <button key={tab} onClick={() => setDbSubTab(tab)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all capitalize ${dbSubTab === tab ? 'bg-[#16161f] text-[#e8e8f0] border border-[#1e1e2e]' : 'text-[#6b6b85]'}`}>
                  {tab === 'options' ? 'Options' : tab === 'prices' ? 'Stock Prices' : 'Fundamentals'}
                </button>
              ))}
            </div>

            {/* Shared search / date controls */}
            <div className="flex gap-3 mb-4">
              <input type="text" value={dbSearch} onChange={e => setDbSearch(e.target.value)}
                placeholder="Search stock/index..."
                className="flex-1 bg-[#111118] border border-[#1e1e2e] rounded-xl px-4 py-2.5 text-xs font-mono text-[#e8e8f0] outline-none" />
              <input type="date" value={dbDateFilter} onChange={e => setDbDateFilter(e.target.value)}
                className="bg-[#111118] border border-[#1e1e2e] rounded-xl px-4 py-2.5 text-xs font-mono text-[#e8e8f0] outline-none" />
              <button onClick={() => { setDbSearch(''); setDbDateFilter(''); setDbFilter('ALL'); }}
                className="bg-[#16161f] border border-[#1e1e2e] rounded-xl px-3 text-xs font-mono text-[#6b6b85]">Clear</button>
              <button onClick={() => { if (dbSubTab === 'options') loadDataBank(); else if (dbSubTab === 'prices') loadStockPrices(); else loadFundamentals(); }}
                className="bg-[#f0c040] text-black font-black rounded-xl px-3 text-xs">Refresh</button>
            </div>

            {/* OPTIONS TAB */}
            {dbSubTab === 'options' && (
              <div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                  {[
                    { label: 'Total Records', value: dbStats.total, color: '#f0c040' },
                    { label: 'Auto-Fetched', value: dbStats.auto, color: '#39d98a' },
                    { label: 'Manual Upload', value: dbStats.manual, color: '#4d9fff' },
                    { label: 'Index Records', value: dbStats.indices, color: '#a78bfa' },
                    { label: 'Stock Records', value: dbStats.stocks, color: '#ff8c42' },
                  ].map((s, i) => (
                    <div key={i} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 text-center">
                      <div className="text-xs font-mono text-[#6b6b85] mb-1">{s.label}</div>
                      <div className="text-xl font-black" style={{ color: s.color }}>{s.value ?? 0}</div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {['ALL', 'AUTO', 'MANUAL', 'INDICES', 'STOCKS'].map(f => (
                    <button key={f} onClick={() => setDbFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${dbFilter === f ? 'bg-[#f0c040] text-black' : 'bg-[#111118] border border-[#1e1e2e] text-[#6b6b85]'}`}>
                      {f}
                    </button>
                  ))}
                </div>
                {deleteMsg && <div className="bg-[#39d98a]/10 border border-[#39d98a]/30 rounded-lg px-4 py-2 text-xs font-mono text-[#39d98a] mb-3">{deleteMsg}</div>}
                {dbLoading ? (
                  <div className="text-center py-12 text-xs font-mono text-[#6b6b85]">Loading...</div>
                ) : (
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-x-auto">
                    <div className="px-4 py-3 border-b border-[#1e1e2e]">
                      <span className="text-xs font-mono text-[#6b6b85]">Showing {dbData.length} of {dbStats.total} records</span>
                    </div>
                    <table className="w-full text-xs font-mono">
                      <thead><tr className="border-b border-[#1e1e2e]">
                        {['Index/Stock', 'Category', 'Expiry', 'Trade Date', 'Strikes', 'Source', 'Action'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[#6b6b85] uppercase font-normal whitespace-nowrap">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {dbData.length === 0 ? (
                          <tr><td colSpan={7} className="text-center py-8 text-[#6b6b85]">No data found</td></tr>
                        ) : dbData.map((row, i) => (
                          <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#f0c040]/5">
                            <td className="px-4 py-3 font-black">{row.index_name}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.category === 'stock' ? 'bg-[#ff8c42]/15 text-[#ff8c42]' : 'bg-[#4d9fff]/15 text-[#4d9fff]'}`}>
                                {(row.category || 'index').toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[#6b6b85]">{row.expiry}</td>
                            <td className="px-4 py-3 text-[#f0c040] font-bold">{row.trade_date}</td>
                            <td className="px-4 py-3 text-[#39d98a] font-bold">{row.strikeCount}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.uploaded_by === 'auto-fetch' ? 'bg-[#39d98a]/15 text-[#39d98a]' : 'bg-[#f0c040]/15 text-[#f0c040]'}`}>
                                {row.uploaded_by === 'auto-fetch' ? 'AUTO' : 'MANUAL'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={() => handleDeleteRow(row.id)}
                                className="text-[#ff4d6d] hover:bg-[#ff4d6d]/10 rounded px-2 py-1 text-[10px] font-bold">Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* STOCK PRICES TAB */}
            {dbSubTab === 'prices' && (
              <div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[
                    { label: 'Total Price Records', value: dbPriceStats.total, color: '#4d9fff' },
                    { label: 'Unique Stocks', value: dbPriceStats.stocks, color: '#39d98a' },
                  ].map((s, i) => (
                    <div key={i} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 text-center">
                      <div className="text-xs font-mono text-[#6b6b85] mb-1">{s.label}</div>
                      <div className="text-xl font-black" style={{ color: s.color }}>{s.value ?? 0}</div>
                    </div>
                  ))}
                </div>
                {dbPriceLoading ? (
                  <div className="text-center py-12 text-xs font-mono text-[#6b6b85]">Loading...</div>
                ) : (
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-x-auto">
                    <div className="px-4 py-3 border-b border-[#1e1e2e]">
                      <span className="text-xs font-mono text-[#6b6b85]">Showing {dbPriceData.length} of {dbPriceStats.total} records</span>
                    </div>
                    <table className="w-full text-xs font-mono">
                      <thead><tr className="border-b border-[#1e1e2e]">
                        {['Stock', 'Date', 'Open', 'High', 'Low', 'Close', 'Volume'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[#6b6b85] uppercase font-normal whitespace-nowrap">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {dbPriceData.length === 0 ? (
                          <tr><td colSpan={7} className="text-center py-8 text-[#6b6b85]">No price data found. Run "Fetch Stocks Data" first.</td></tr>
                        ) : dbPriceData.map((row, i) => (
                          <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#4d9fff]/5">
                            <td className="px-4 py-3 font-black text-[#4d9fff]">{row.stock_name}</td>
                            <td className="px-4 py-3 text-[#f0c040]">{row.trade_date}</td>
                            <td className="px-4 py-3">{row.open?.toFixed(2)}</td>
                            <td className="px-4 py-3 text-[#39d98a]">{row.high?.toFixed(2)}</td>
                            <td className="px-4 py-3 text-[#ff4d6d]">{row.low?.toFixed(2)}</td>
                            <td className="px-4 py-3 font-bold">{row.close?.toFixed(2)}</td>
                            <td className="px-4 py-3 text-[#6b6b85]">{row.volume?.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* FUNDAMENTALS TAB */}
            {dbSubTab === 'fundamentals' && (
              <div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[
                    { label: 'Total Fundamental Records', value: dbFundStats.total, color: '#a78bfa' },
                  ].map((s, i) => (
                    <div key={i} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 text-center">
                      <div className="text-xs font-mono text-[#6b6b85] mb-1">{s.label}</div>
                      <div className="text-xl font-black" style={{ color: s.color }}>{s.value ?? 0}</div>
                    </div>
                  ))}
                </div>
                {dbFundLoading ? (
                  <div className="text-center py-12 text-xs font-mono text-[#6b6b85]">Loading...</div>
                ) : (
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-x-auto">
                    <div className="px-4 py-3 border-b border-[#1e1e2e]">
                      <span className="text-xs font-mono text-[#6b6b85]">Showing {dbFundData.length} of {dbFundStats.total} records</span>
                    </div>
                    <table className="w-full text-xs font-mono">
                      <thead><tr className="border-b border-[#1e1e2e]">
                        {['Stock', 'Date', 'LTP', 'PE', 'EPS', 'Book Val', '52W H', '52W L', 'Mkt Cap', 'ROCE'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[#6b6b85] uppercase font-normal whitespace-nowrap">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {dbFundData.length === 0 ? (
                          <tr><td colSpan={10} className="text-center py-8 text-[#6b6b85]">No fundamental data found. Run "Fetch Fundamentals" first.</td></tr>
                        ) : dbFundData.map((row, i) => (
                          <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#a78bfa]/5">
                            <td className="px-4 py-3 font-black text-[#a78bfa]">{row.stock_name}</td>
                            <td className="px-4 py-3 text-[#f0c040]">{row.trade_date}</td>
                            <td className="px-4 py-3 font-bold">{row.ltp?.toFixed(2) ?? '-'}</td>
                            <td className="px-4 py-3">{row.pe_ratio?.toFixed(2) ?? '-'}</td>
                            <td className="px-4 py-3">{row.eps?.toFixed(2) ?? '-'}</td>
                            <td className="px-4 py-3">{row.book_value?.toFixed(2) ?? '-'}</td>
                            <td className="px-4 py-3 text-[#39d98a]">{row.week52_high?.toFixed(2) ?? '-'}</td>
                            <td className="px-4 py-3 text-[#ff4d6d]">{row.week52_low?.toFixed(2) ?? '-'}</td>
                            <td className="px-4 py-3 text-[#6b6b85]">{row.market_cap ? `${(row.market_cap / 10000000).toFixed(0)} Cr` : '-'}</td>
                            <td className="px-4 py-3">{row.roce?.toFixed(2) ?? '-'}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'queries' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-black">Customer Queries</h2>
              <button onClick={handleDownloadQueries} className="bg-[#f0c040] text-black font-black text-xs px-4 py-2.5 rounded-xl">Download All</button>
            </div>
            <div className="flex gap-2 mb-4">
              {['All', 'Pending', 'Answered'].map(f => (
                <button key={f} onClick={() => setQueryFilter(f)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold ${queryFilter === f ? 'bg-[#f0c040] text-black' : 'bg-[#111118] border border-[#1e1e2e] text-[#6b6b85]'}`}>
                  {f} ({f === 'All' ? queries.length : queries.filter(q => q.status === f).length})
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {filteredQueries.map((q, i) => (
                <div key={i} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black">{q.username}</span>
                      <span className="text-[10px] font-black bg-[#f0c040]/15 text-[#f0c040] px-2 py-0.5 rounded">{q.plan?.toUpperCase()}</span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded ${q.status === 'Answered' ? 'bg-[#39d98a]/15 text-[#39d98a]' : 'bg-[#f0c040]/15 text-[#f0c040]'}`}>{q.status}</span>
                    </div>
                    <span className="text-[10px] font-mono text-[#6b6b85]">{new Date(q.created_at).toLocaleDateString('en-IN')}</span>
                  </div>
                  <div className="text-xs font-mono text-[#e8e8f0] mb-4 bg-[#16161f] rounded-lg p-3">{q.query_text}</div>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer bg-[#39d98a] text-black font-black text-xs px-4 py-2 rounded-lg">
                      <input type="file" accept=".pdf" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (file) await handleUploadAnswer(q.id, file); }} />
                      {uploadingAnswer === q.id ? 'Uploading...' : 'Upload Answer'}
                    </label>
                    {q.answer_pdf_url && <a href={q.answer_pdf_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#4d9fff]">View Answer</a>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'autofetch' && (
          <div className="space-y-6">
            <h2 className="text-base font-black">Auto Fetch Market Data</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 text-center">
                <div className="text-2xl font-black text-[#f0c040]">{weeklyIndices.length}</div>
                <div className="text-[10px] font-mono text-[#6b6b85] mt-1">Weekly Indices</div>
              </div>
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 text-center">
                <div className="text-2xl font-black text-[#4d9fff]">{monthlyIndices.length}</div>
                <div className="text-[10px] font-mono text-[#6b6b85] mt-1">Monthly Indices</div>
              </div>
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 text-center">
                <div className="text-2xl font-black text-[#39d98a]">{totalStocks}</div>
                <div className="text-[10px] font-mono text-[#6b6b85] mt-1">Stocks</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button onClick={handleFetchStocksData} disabled={fetchStocksLoading}
                className="bg-[#4d9fff] text-black font-black text-sm py-4 rounded-xl disabled:opacity-40">
                {fetchStocksLoading ? 'Fetching...' : 'Fetch Stocks Data'}
              </button>
              <button onClick={handleFetchFundamentals} disabled={fetchFundLoading}
                className="bg-[#a78bfa] text-black font-black text-sm py-4 rounded-xl disabled:opacity-40">
                {fetchFundLoading ? 'Fetching...' : 'Fetch Fundamentals'}
              </button>
              <button onClick={handleAutoFetch} disabled={fetchLoading}
                className="bg-[#39d98a] text-black font-black text-sm py-4 rounded-xl disabled:opacity-40">
                {fetchLoading ? 'Fetching...' : 'Fetch All'}
              </button>
            </div>

            {fetchStocksDone && fetchStocksResults.length > 0 && (
              <div className="bg-[#111118] border border-[#4d9fff]/30 rounded-xl p-5">
                <div className="text-xs font-mono font-bold mb-3 text-[#4d9fff]">Stocks Data Results</div>
                <div className="text-xs font-mono font-bold mb-3 flex gap-4 flex-wrap">
                  <span className="text-[#39d98a]">{fetchStocksResults.filter(r => r.status === 'saved').length} saved</span>
                  <span className="text-[#f0c040]">{fetchStocksResults.filter(r => r.status === 'duplicate').length} duplicates</span>
                  <span className="text-[#6b6b85]">{fetchStocksResults.filter(r => r.status === 'empty').length} empty</span>
                  <span className="text-[#ff4d6d]">{fetchStocksResults.filter(r => r.status === 'error').length} errors</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {fetchStocksResults.map((r, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono ${r.status === 'saved' ? 'bg-[#39d98a]/10 text-[#39d98a]' : r.status === 'duplicate' ? 'bg-[#f0c040]/10 text-[#f0c040]' : r.status === 'empty' ? 'bg-[#6b6b85]/10 text-[#6b6b85]' : 'bg-[#ff4d6d]/10 text-[#ff4d6d]'}`}>
                      <span>{r.index}{r.expiry ? ` | ${r.expiry}` : ''}</span>
                      <span>{r.status === 'saved' ? `Saved${r.strikes ? ` (${r.strikes})` : ''}` : r.status === 'duplicate' ? 'Already exists' : r.status === 'empty' ? 'Market closed' : `Error: ${r.error || ''}`}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fetchFundDone && fetchFundResults.length > 0 && (
              <div className="bg-[#111118] border border-[#a78bfa]/30 rounded-xl p-5">
                <div className="text-xs font-mono font-bold mb-3 text-[#a78bfa]">Fundamentals Results</div>
                <div className="text-xs font-mono font-bold mb-3 flex gap-4 flex-wrap">
                  <span className="text-[#39d98a]">{fetchFundResults.filter(r => r.status === 'saved' || r.status === 'updated').length} saved/updated</span>
                  <span className="text-[#6b6b85]">{fetchFundResults.filter(r => r.status === 'empty').length} empty</span>
                  <span className="text-[#ff4d6d]">{fetchFundResults.filter(r => r.status === 'error').length} errors</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {fetchFundResults.map((r, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono ${r.status === 'saved' || r.status === 'updated' ? 'bg-[#39d98a]/10 text-[#39d98a]' : r.status === 'empty' ? 'bg-[#6b6b85]/10 text-[#6b6b85]' : 'bg-[#ff4d6d]/10 text-[#ff4d6d]'}`}>
                      <span>{r.index}</span>
                      <span>{r.status === 'saved' ? 'Saved' : r.status === 'updated' ? 'Updated' : r.status === 'empty' ? 'No data' : `Error: ${r.error || ''}`}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fetchDone && fetchResults.length > 0 && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
                <div className="text-xs font-mono font-bold mb-3">Full Fetch Results</div>
                <div className="text-xs font-mono font-bold mb-3 flex gap-4 flex-wrap">
                  <span className="text-[#39d98a]">{fetchResults.filter(r => r.status === 'saved' || r.status === 'updated').length} saved</span>
                  <span className="text-[#f0c040]">{fetchResults.filter(r => r.status === 'duplicate').length} duplicates</span>
                  <span className="text-[#6b6b85]">{fetchResults.filter(r => r.status === 'empty').length} empty</span>
                  <span className="text-[#ff4d6d]">{fetchResults.filter(r => r.status === 'error').length} errors</span>
                </div>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {fetchResults.map((r, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono ${r.status === 'saved' || r.status === 'updated' ? 'bg-[#39d98a]/10 text-[#39d98a]' : r.status === 'duplicate' ? 'bg-[#f0c040]/10 text-[#f0c040]' : r.status === 'empty' ? 'bg-[#6b6b85]/10 text-[#6b6b85]' : 'bg-[#ff4d6d]/10 text-[#ff4d6d]'}`}>
                      <span>{r.index}{r.expiry ? ` | ${r.expiry}` : ''}</span>
                      <span>{r.status === 'saved' ? `Saved${r.strikes ? ` (${r.strikes})` : ''}` : r.status === 'updated' ? 'Updated' : r.status === 'duplicate' ? 'Already exists' : r.status === 'empty' ? 'Market closed' : `Error: ${r.error || ''}`}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-black text-[#f0c040]">Indices</div>
                <button onClick={() => setShowAddIndex(!showAddIndex)} className="text-xs font-black bg-[#f0c040] text-black px-3 py-1.5 rounded-lg">
                  {showAddIndex ? 'Cancel' : '+ Add Index'}
                </button>
              </div>
              {showAddIndex && (
                <div className="bg-[#16161f] border border-[#f0c040]/20 rounded-xl p-4 mb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input placeholder="Symbol" value={newIndexKey} onChange={e => setNewIndexKey(e.target.value)} className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-xs font-mono text-[#e8e8f0] outline-none" />
                    <input placeholder="Display Name" value={newIndexName} onChange={e => setNewIndexName(e.target.value)} className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-xs font-mono text-[#e8e8f0] outline-none" />
                    <select value={newIndexExchange} onChange={e => setNewIndexExchange(e.target.value)} className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-xs font-mono text-[#e8e8f0] outline-none">
                      <option value="NSE">NSE</option>
                      <option value="BSE">BSE</option>
                    </select>
                    <select value={newIndexExpiry} onChange={e => setNewIndexExpiry(e.target.value)} className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-xs font-mono text-[#e8e8f0] outline-none">
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <input placeholder="Upstox Key" value={newIndexUpstox} onChange={e => setNewIndexUpstox(e.target.value)} className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-xs font-mono text-[#e8e8f0] outline-none" />
                  <button onClick={handleAddIndex} className="w-full bg-[#f0c040] text-black font-black text-xs py-2 rounded-lg">Add Index</button>
                </div>
              )}
              <div className="space-y-2 mb-4">
                {weeklyIndices.map((idx, i) => (
                  <div key={i} className="flex items-center justify-between bg-[#16161f] rounded-lg px-4 py-3">
                    <div>
                      <div className="text-xs font-black" style={{ color: idx.color }}>{idx.name}</div>
                      <div className="text-[10px] font-mono text-[#6b6b85]">{idx.exchange} · {idx.upstoxKey}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black bg-[#f0c040]/15 text-[#f0c040] px-2 py-0.5 rounded">WEEKLY</span>
                      <button onClick={() => handleRemoveIndex(idx.key)} className="text-[#ff4d6d] text-xs px-2 py-1">X</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {monthlyIndices.map((idx, i) => (
                  <div key={i} className="flex items-center justify-between bg-[#16161f] rounded-lg px-4 py-3">
                    <div>
                      <div className="text-xs font-black" style={{ color: idx.color }}>{idx.name}</div>
                      <div className="text-[10px] font-mono text-[#6b6b85]">{idx.exchange} · {idx.upstoxKey}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black bg-[#4d9fff]/15 text-[#4d9fff] px-2 py-0.5 rounded">MONTHLY</span>
                      <button onClick={() => handleRemoveIndex(idx.key)} className="text-[#ff4d6d] text-xs px-2 py-1">X</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
              <div className="text-sm font-black text-[#39d98a] mb-4">Sectors and Stocks</div>
              <div className="bg-[#16161f] border border-[#39d98a]/20 rounded-xl p-4 mb-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select value={addStockSector} onChange={e => setAddStockSector(e.target.value)} className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-xs font-mono text-[#e8e8f0] outline-none">
                    <option value="">Select sector...</option>
                    {sectors.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>
                  <input placeholder="NSE Symbol" value={addStockName} onChange={e => setAddStockName(e.target.value.toUpperCase())} className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-xs font-mono text-[#e8e8f0] outline-none" />
                  <button onClick={handleAddStock} className="bg-[#39d98a] text-black font-black text-xs py-2 rounded-lg">Add Stock</button>
                </div>
              </div>
              <div className="space-y-4">
                {sectors.map((sector, si) => (
                  <div key={si} className="border border-[#1e1e2e] rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3" style={{ background: `${sector.color}10`, borderBottom: '1px solid #1e1e2e' }}>
                      <span>{sector.emoji}</span>
                      <span className="text-sm font-black" style={{ color: sector.color }}>{sector.name}</span>
                      <span className="text-[10px] font-mono text-[#6b6b85]">{sector.stocks.length} stocks</span>
                    </div>
                    <div className="p-3 flex flex-wrap gap-2">
                      {sector.stocks.map((stock: string, sti: number) => (
                        <div key={sti} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono font-bold" style={{ background: `${sector.color}15`, color: sector.color }}>
                          {stock}
                          <button onClick={() => handleRemoveStock(sector.name, stock)} className="ml-1 opacity-60 text-[10px]">X</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div>
            <h2 className="text-base font-black mb-6">Platform Settings</h2>
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase mb-2">Subscriber Count</label>
                  <input type="text" value={subscriberCount} onChange={e => setSubscriberCount(e.target.value)} placeholder="e.g. 2600+" className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase mb-2">Announcement Banner</label>
                  <input type="text" value={announcement} onChange={e => setAnnouncement(e.target.value)} placeholder="Leave empty to hide..." className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none" />
                </div>
              </div>
              {settingsMsg && <div className="mt-3 text-xs font-mono text-[#39d98a]">{settingsMsg}</div>}
              <button onClick={handleSaveSettings} className="mt-4 bg-[#f0c040] text-black font-black text-xs px-6 py-2.5 rounded-xl">Save Settings</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
