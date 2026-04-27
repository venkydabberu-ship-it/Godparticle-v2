import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { runDailyAutoFetch, autoFetchAllIndices, autoFetchAllStockOptions, autoFetchAllStockPrices, autoFetchAllFundamentals } from '../lib/autofetch';

const DEFAULT_INDICES = [
  { key: 'NIFTY50',     name: 'Nifty 50',     exchange: 'NSE', expiry: 'weekly',  upstoxKey: 'NSE_INDEX|Nifty 50',            color: '#f0c040', edgeType: 'nifty_chain' },
  { key: 'SENSEX',      name: 'Sensex',        exchange: 'BSE', expiry: 'weekly',  upstoxKey: 'BSE_INDEX|SENSEX',              color: '#4d9fff', edgeType: 'sensex_chain' },
  { key: 'BANKNIFTY',   name: 'Bank Nifty',    exchange: 'NSE', expiry: 'monthly', upstoxKey: 'NSE_INDEX|Nifty Bank',          color: '#39d98a', edgeType: 'banknifty_chain' },
  { key: 'FINNIFTY',    name: 'Fin Nifty',     exchange: 'NSE', expiry: 'monthly', upstoxKey: 'NSE_INDEX|Nifty Fin Service',   color: '#a78bfa', edgeType: 'finnifty_chain' },
  { key: 'MIDCAPNIFTY', name: 'Midcap Nifty',  exchange: 'NSE', expiry: 'monthly', upstoxKey: 'NSE_INDEX|Nifty Midcap Select', color: '#ff8c42', edgeType: 'midcapnifty_chain' },
  { key: 'NIFTYNEXT50', name: 'Nifty Next 50', exchange: 'NSE', expiry: 'monthly', upstoxKey: 'NSE_INDEX|Nifty Next 50',       color: '#ff4d6d', edgeType: 'niftynext50_chain' },
  { key: 'BANKEX',      name: 'Bankex',        exchange: 'BSE', expiry: 'monthly', upstoxKey: 'BSE_INDEX|BANKEX',              color: '#39d98a', edgeType: 'bankex_chain' },
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

  // Folder navigation for Options Data Bank
  const [optView, setOptView] = useState<'categories' | 'names' | 'rows'>('categories');
  const [optCategory, setOptCategory] = useState<'index' | 'stock'>('index');
  const [optNames, setOptNames] = useState<string[]>([]);
  const [selectedOptName, setSelectedOptName] = useState('');
  const [optRows, setOptRows] = useState<any[]>([]);
  const [optNamesLoading, setOptNamesLoading] = useState(false);
  const [optRowsLoading, setOptRowsLoading] = useState(false);

  // Fetch index options state
  const [fetchIndicesLoading, setFetchIndicesLoading] = useState(false);
  const [fetchIndicesResults, setFetchIndicesResults] = useState<any[]>([]);
  const [fetchIndicesDone, setFetchIndicesDone] = useState(false);
  // Fetch stock options state
  const [fetchStockOptLoading, setFetchStockOptLoading] = useState(false);
  const [fetchStockOptResults, setFetchStockOptResults] = useState<any[]>([]);
  const [fetchStockOptDone, setFetchStockOptDone] = useState(false);
  // Fetch stock prices state
  const [fetchStockPriceLoading, setFetchStockPriceLoading] = useState(false);
  const [fetchStockPriceResults, setFetchStockPriceResults] = useState<any[]>([]);
  const [fetchStockPriceDone, setFetchStockPriceDone] = useState(false);

  // Folder navigation for Stock Prices
  const [priceView, setPriceView] = useState<'stocks' | 'rows'>('stocks');
  const [priceStockNames, setPriceStockNames] = useState<string[]>([]);
  const [selectedPriceStock, setSelectedPriceStock] = useState('');
  const [priceRowsForStock, setPriceRowsForStock] = useState<any[]>([]);
  // Folder navigation for Fundamentals
  const [fundView, setFundView] = useState<'stocks' | 'rows'>('stocks');
  const [fundStockNames, setFundStockNames] = useState<string[]>([]);
  const [selectedFundStock, setSelectedFundStock] = useState('');
  const [fundRowsForStock, setFundRowsForStock] = useState<any[]>([]);
  const [editRow, setEditRow] = useState<{ id: string; role: string; credits: number } | null>(null);
  const [editMsg, setEditMsg] = useState<{ id: string; msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (profile?.role !== 'admin') return;
    loadAll();
    loadAutoFetchConfig();
  }, [profile]);

  useEffect(() => {
    if (activeTab !== 'databank') return;
    setPriceView('stocks');
    setFundView('stocks');
    setOptView('categories');
    if (dbSubTab === 'options') { /* folder view starts at categories, no initial load needed */ }
    else if (dbSubTab === 'prices') loadStockPrices();
    else if (dbSubTab === 'fundamentals') loadFundamentals();
  }, [activeTab, dbSubTab]);

  // Filter useEffect kept for prices/fundamentals search if needed in future

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
    setPriceView('stocks');
    try {
      // Paginate to get all stock names (old stocks have thousands of rows each)
      const pageSize = 1000;
      let allNames: string[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase.from('stock_price_data').select('stock_name').order('stock_name').range(from, from + pageSize - 1);
        if (!data || data.length === 0) break;
        allNames = [...allNames, ...data.map((r: any) => r.stock_name)];
        if (data.length < pageSize) break;
        from += pageSize;
      }
      const names: string[] = [...new Set(allNames)];
      setPriceStockNames(names);
      const { count: total } = await supabase.from('stock_price_data').select('*', { count: 'exact', head: true });
      setDbPriceStats({ total: total || 0, stocks: names.length });
    } catch (err: any) {
      console.error('loadStockPrices error:', err);
    } finally {
      setDbPriceLoading(false);
    }
  }

  async function openPriceStock(stock: string) {
    setDbPriceLoading(true);
    try {
      const { data } = await supabase.from('stock_price_data')
        .select('*').eq('stock_name', stock).order('trade_date', { ascending: false });
      setSelectedPriceStock(stock);
      setPriceRowsForStock(data || []);
      setPriceView('rows');
    } catch (err: any) {
      console.error(err);
    } finally {
      setDbPriceLoading(false);
    }
  }

  async function loadFundamentals() {
    setDbFundLoading(true);
    setFundView('stocks');
    try {
      const { data } = await supabase.from('stock_fundamentals').select('stock_name').order('stock_name');
      const names: string[] = [...new Set((data || []).map((r: any) => r.stock_name))];
      setFundStockNames(names);
      const { count: total } = await supabase.from('stock_fundamentals').select('*', { count: 'exact', head: true });
      setDbFundStats({ total: total || 0 });
    } catch (err: any) {
      console.error('loadFundamentals error:', err);
    } finally {
      setDbFundLoading(false);
    }
  }

  async function openFundStock(stock: string) {
    setDbFundLoading(true);
    try {
      const { data } = await supabase.from('stock_fundamentals')
        .select('*').eq('stock_name', stock).order('trade_date', { ascending: false });
      setSelectedFundStock(stock);
      setFundRowsForStock(data || []);
      setFundView('rows');
    } catch (err: any) {
      console.error(err);
    } finally {
      setDbFundLoading(false);
    }
  }

  async function loadOptNames(category: 'index' | 'stock') {
    setOptNamesLoading(true);
    setOptCategory(category);
    try {
      if (category === 'index') {
        // Always show all known index folders, regardless of whether data exists yet
        const names = DEFAULT_INDICES.map(i => i.key);
        setOptNames(names);
      } else {
        const { data } = await supabase.from('market_data').select('index_name').eq('category', category).order('index_name');
        const names: string[] = [...new Set((data || []).map((r: any) => r.index_name))];
        setOptNames(names);
      }
      setOptView('names');
    } catch (err: any) {
      console.error(err);
    } finally {
      setOptNamesLoading(false);
    }
  }

  function downloadRowCSV(row: any, name: string) {
    const sd = row.strike_data || {};
    const lines = ['Strike,CE OI,CE Chng OI,CE Vol,CE LTP,PE LTP,PE Vol,PE Chng OI,PE OI'];
    Object.entries(sd).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([strike, d]: [string, any]) => {
      lines.push([strike, d.ce_oi ?? 0, d.ce_coi ?? d.ce_chng_oi ?? 0, d.ce_vol ?? 0, d.ce_ltp ?? 0,
        d.pe_ltp ?? 0, d.pe_vol ?? 0, d.pe_coi ?? d.pe_chng_oi ?? 0, d.pe_oi ?? 0].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}_${row.expiry}_${row.trade_date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadAllCSV(rows: any[], name: string) {
    const lines = ['Trade Date,Expiry,Strike,CE OI,CE Chng OI,CE Vol,CE LTP,PE LTP,PE Vol,PE Chng OI,PE OI'];
    rows.forEach(row => {
      const sd = row.strike_data || {};
      Object.entries(sd).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([strike, d]: [string, any]) => {
        lines.push([row.trade_date, row.expiry, strike, d.ce_oi ?? 0, d.ce_coi ?? d.ce_chng_oi ?? 0,
          d.ce_vol ?? 0, d.ce_ltp ?? 0, d.pe_ltp ?? 0, d.pe_vol ?? 0,
          d.pe_coi ?? d.pe_chng_oi ?? 0, d.pe_oi ?? 0].join(','));
      });
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}_ALL_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function loadOptRows(name: string) {
    setOptRowsLoading(true);
    setSelectedOptName(name);
    try {
      const { data } = await supabase.from('market_data')
        .select('id, expiry, trade_date, uploaded_by, strike_data, created_at')
        .eq('index_name', name)
        .order('trade_date', { ascending: false });
      const enriched = (data || []).map(row => ({
        ...row,
        strikeCount: row.strike_data ? Object.keys(row.strike_data).length : 0,
      }));
      setOptRows(enriched);
      setOptView('rows');
    } catch (err: any) {
      console.error(err);
    } finally {
      setOptRowsLoading(false);
    }
  }

  async function handleFetchIndices() {
    setFetchIndicesLoading(true);
    setFetchIndicesDone(false);
    setFetchIndicesResults([]);
    try {
      const res = await autoFetchAllIndices();
      setFetchIndicesResults(res);
      setFetchIndicesDone(true);
    } catch (err: any) {
      setFetchIndicesResults([{ status: 'error', error: err.message }]);
      setFetchIndicesDone(true);
    } finally {
      setFetchIndicesLoading(false);
    }
  }

  async function handleFetchStockOptions() {
    setFetchStockOptLoading(true);
    setFetchStockOptDone(false);
    setFetchStockOptResults([]);
    try {
      const res = await autoFetchAllStockOptions();
      setFetchStockOptResults(res);
      setFetchStockOptDone(true);
    } catch (err: any) {
      setFetchStockOptResults([{ status: 'error', error: err.message }]);
      setFetchStockOptDone(true);
    } finally {
      setFetchStockOptLoading(false);
    }
  }

  async function handleFetchStockPrices() {
    setFetchStockPriceLoading(true);
    setFetchStockPriceDone(false);
    setFetchStockPriceResults([]);
    try {
      const res = await autoFetchAllStockPrices();
      setFetchStockPriceResults(res);
      setFetchStockPriceDone(true);
    } catch (err: any) {
      setFetchStockPriceResults([{ status: 'error', error: err.message }]);
      setFetchStockPriceDone(true);
    } finally {
      setFetchStockPriceLoading(false);
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
    let usersData: any[] | null = null;

    // Try SECURITY DEFINER RPC first (bypasses RLS)
    const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_get_all_profiles', { p_admin_id: user?.id });
    if (rpcErr) console.error('[Admin] RPC error:', rpcErr.message);
    if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
      usersData = rpcData;
    }

    // Fallback: direct table read (works if RLS allows admin reads)
    if (!usersData) {
      const { data: directData, error: directErr } = await supabase
        .from('profiles').select('*').order('created_at', { ascending: false });
      if (directErr) console.error('[Admin] Direct read error:', directErr.message);
      if (directData) usersData = directData;
    }

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
    const derivedEdgeType = newIndexKey.toUpperCase().replace(/[^A-Z0-9]/g, '').toLowerCase() + '_chain';
    const newIdx = { key: newIndexKey.toUpperCase(), name: newIndexName, exchange: newIndexExchange, expiry: newIndexExpiry, upstoxKey: newIndexUpstox, color: '#f0c040', edgeType: derivedEdgeType };
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

  function roleDefaults(role: string) {
    if (role === 'premium') return { status: 'ACTIVE', plan: 'premium', credits: 1000 };
    if (role === 'basic')   return { status: 'ACTIVE', plan: 'basic',   credits: 100  };
    if (role === 'free')    return { status: 'CANCELLED', plan: '',      credits: 0   };
    return { status: 'ACTIVE', plan: role, credits: 0 };
  }

  async function adminRoleRpc(userId: string, role: string, credits: number) {
    const { status, plan } = roleDefaults(role);
    const { data, error } = await supabase.rpc('admin_update_user_role', {
      p_admin_id: user!.id,
      p_user_id: userId,
      p_role: role,
      p_credits: credits,
      p_subscription_status: status,
      p_subscription_plan: plan,
    });
    if (error) return error.message;
    if (data !== 'ok') return data as string;
    return null;
  }

  async function handleGrantCredits() {
    if (!grantUserId || !grantCredits) { setGrantMsg('Select user and enter credits!'); return; }
    const targetUser = users.find(u => u.id === grantUserId);
    const addAmount = parseInt(grantCredits);
    if (isNaN(addAmount) || addAmount <= 0) { setGrantMsg('Enter a valid credit amount.'); return; }
    const newCredits = (targetUser?.credits ?? 0) + addAmount;
    const err = await adminRoleRpc(grantUserId, targetUser?.role ?? 'free', newCredits);
    if (err) { setGrantMsg(`Error: ${err}`); return; }
    setGrantMsg(`+${addAmount} credits added! ${targetUser?.username} now has ${newCredits} total.`);
    setTimeout(() => setGrantMsg(''), 5000);
    loadAll();
  }

  async function handleChangeRole() {
    if (!changeRoleUserId || !changeRole) { setRoleMsg('Select user and role!'); return; }
    const { credits } = roleDefaults(changeRole);
    const err = await adminRoleRpc(changeRoleUserId, changeRole, credits);
    if (err) { setRoleMsg(`Error: ${err}`); return; }
    await loadAll();
    const updated = users.find(u => u.id === changeRoleUserId);
    const confirmedRole = (updated as any)?.role ?? '?';
    const confirmedCr   = (updated as any)?.credits ?? '?';
    setRoleMsg(`Done! DB now shows: role=${confirmedRole}, credits=${confirmedCr}. Ask user to reload.`);
    setTimeout(() => setRoleMsg(''), 8000);
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
                { label: 'Total Analyses', value: stats.totalAnalyses, color: '#ff4d6d' },
                { label: 'Pending Queries', value: stats.pendingQueries, color: '#f0c040' },
                { label: 'Revenue Est.', value: `₹${((stats.basicUsers ?? 0) * 99 + (stats.premiumUsers ?? 0) * 299).toLocaleString()}`, color: '#39d98a' },
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
                <div className="text-sm font-black mb-1 text-[#f0c040]">Add Credits</div>
                <div className="text-[10px] font-mono text-[#6b6b85] mb-3">Credits are ADDED to the user's existing balance</div>
                <div className="space-y-3">
                  <select value={grantUserId} onChange={e => setGrantUserId(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none">
                    <option value="">Select user...</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.username} — {u.credits} cr ({u.role})</option>)}
                  </select>
                  <input type="number" value={grantCredits} onChange={e => setGrantCredits(e.target.value)}
                    placeholder="Credits to add (e.g. 500)"
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none" />
                  <button onClick={handleGrantCredits}
                    className="w-full bg-[#f0c040] text-black font-black text-xs py-2.5 rounded-xl">
                    Add Credits
                  </button>
                  {grantMsg && <div className="text-xs font-mono text-[#39d98a]">{grantMsg}</div>}
                </div>
              </div>
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
                <div className="text-sm font-black mb-1 text-[#4d9fff]">Change Role</div>
                <div className="text-[10px] font-mono text-[#6b6b85] mb-3">Also updates plan, credits &amp; subscription status</div>
                <div className="space-y-3">
                  <select value={changeRoleUserId} onChange={e => setChangeRoleUserId(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none">
                    <option value="">Select user...</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}
                  </select>
                  <select value={changeRole} onChange={e => setChangeRole(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none">
                    <option value="">Select role...</option>
                    <option value="free">Free — reset to 0 credits, cancel sub</option>
                    <option value="basic">Basic — set 100 credits, activate sub</option>
                    <option value="premium">Premium — set 1000 credits, activate sub</option>
                    <option value="pro">Pro — unlimited, no credit deduction</option>
                    <option value="admin">Admin — full access</option>
                  </select>
                  <button onClick={handleChangeRole}
                    className="w-full bg-[#4d9fff] text-black font-black text-xs py-2.5 rounded-xl">
                    Apply Role Change
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
                  {users.filter(u => !searchUser || u.username?.toLowerCase().includes(searchUser.toLowerCase())).map((u, i) => {
                    const isEditing = editRow?.id === u.id;
                    const isAdmin = u.id === user?.id;
                    return (
                      <tr key={i} className="border-b border-[#1e1e2e]/50">
                        <td className="px-4 py-3 font-bold">
                          {u.username}
                          {isAdmin && <span className="ml-1 text-[8px] text-[#f0c040] font-mono">(you)</span>}
                        </td>
                        <td className="px-4 py-3">
                          {isEditing
                            ? <select value={editRow.role} onChange={e => setEditRow(r => r && ({ ...r, role: e.target.value }))}
                                className="bg-[#16161f] border border-[#4d9fff] rounded px-2 py-1 text-xs font-mono text-[#e8e8f0] outline-none w-24">
                                <option value="free">Free</option>
                                <option value="basic">Basic</option>
                                <option value="premium">Premium</option>
                                <option value="pro">Pro</option>
                                <option value="admin">Admin</option>
                              </select>
                            : <span className={`px-2 py-0.5 rounded text-xs font-bold ${roleColors[u.role] || roleColors.free}`}>{u.role?.toUpperCase()}</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-[#f0c040] font-bold">
                          {isEditing
                            ? <input type="number" value={editRow.credits} onChange={e => setEditRow(r => r && ({ ...r, credits: Number(e.target.value) }))}
                                className="bg-[#16161f] border border-[#4d9fff] rounded px-2 py-1 text-xs font-mono text-[#e8e8f0] outline-none w-24" />
                            : u.credits?.toLocaleString()
                          }
                        </td>
                        <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-bold ${u.is_active ? 'bg-[#39d98a]/15 text-[#39d98a]' : 'bg-[#ff4d6d]/15 text-[#ff4d6d]'}`}>{u.is_active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                        <td className="px-4 py-3 text-[#6b6b85]">{new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="flex gap-1 items-center">
                              <button onClick={async () => {
                                const err = await adminRoleRpc(editRow.id, editRow.role, editRow.credits);
                                if (err) {
                                  setEditMsg({ id: u.id, msg: `Error: ${err}`, ok: false });
                                } else {
                                  setEditMsg({ id: u.id, msg: '✓ Updated!', ok: true });
                                  setEditRow(null);
                                  await loadAll();
                                }
                                setTimeout(() => setEditMsg(null), 4000);
                              }} className="bg-[#39d98a] text-black font-black text-[10px] px-2 py-1 rounded">
                                Save
                              </button>
                              <button onClick={() => { setEditRow(null); setEditMsg(null); }}
                                className="bg-[#1e1e2e] text-[#6b6b85] font-bold text-[10px] px-2 py-1 rounded">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-1 items-center">
                              <button onClick={() => { setEditRow({ id: u.id, role: u.role, credits: u.credits }); setEditMsg(null); }}
                                className="bg-[#4d9fff] text-black font-black text-[10px] px-2 py-1 rounded">
                                Edit
                              </button>
                              {editMsg?.id === u.id && (
                                <span className={`text-[10px] font-mono ${editMsg.ok ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}`}>{editMsg.msg}</span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
                {/* Breadcrumb */}
                <div className="flex items-center gap-2 mb-4 text-xs font-mono">
                  <button onClick={() => setOptView('categories')} className={`hover:underline ${optView === 'categories' ? 'text-[#e8e8f0] font-black' : 'text-[#f0c040]'}`}>Options Bank</button>
                  {optView !== 'categories' && (
                    <>
                      <span className="text-[#6b6b85]">›</span>
                      <button onClick={() => setOptView('names')} className={`hover:underline ${optView === 'names' ? 'text-[#e8e8f0] font-black' : 'text-[#f0c040]'}`}>
                        {optCategory === 'index' ? 'Indices' : 'Stocks'}
                      </button>
                    </>
                  )}
                  {optView === 'rows' && (
                    <>
                      <span className="text-[#6b6b85]">›</span>
                      <span className="text-[#e8e8f0] font-black">{selectedOptName}</span>
                      <span className="text-[#6b6b85]">({optRows.length} records)</span>
                    </>
                  )}
                </div>

                {deleteMsg && <div className="bg-[#39d98a]/10 border border-[#39d98a]/30 rounded-lg px-4 py-2 text-xs font-mono text-[#39d98a] mb-3">{deleteMsg}</div>}

                {/* Level 1: Category selection */}
                {optView === 'categories' && (
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => loadOptNames('index')} disabled={optNamesLoading}
                      className="bg-[#111118] border border-[#4d9fff] rounded-2xl p-8 hover:shadow-[0_0_20px_rgba(77,159,255,0.15)] transition-all text-left group">
                      <div className="text-4xl mb-3">📈</div>
                      <div className="text-base font-black text-[#4d9fff] mb-1">Indices</div>
                      <div className="text-xs font-mono text-[#6b6b85]">Nifty 50, BankNifty, Sensex, etc.</div>
                    </button>
                    <button onClick={() => loadOptNames('stock')} disabled={optNamesLoading}
                      className="bg-[#111118] border border-[#ff8c42] rounded-2xl p-8 hover:shadow-[0_0_20px_rgba(255,140,66,0.15)] transition-all text-left group">
                      <div className="text-4xl mb-3">📦</div>
                      <div className="text-base font-black text-[#ff8c42] mb-1">Stocks</div>
                      <div className="text-xs font-mono text-[#6b6b85]">HDFCBANK, TCS, RELIANCE, etc.</div>
                    </button>
                  </div>
                )}

                {/* Level 2: Name selection */}
                {optView === 'names' && (
                  optNamesLoading ? (
                    <div className="text-center py-12 text-xs font-mono text-[#6b6b85]">Loading...</div>
                  ) : optNames.length === 0 ? (
                    <div className="text-center py-12 text-xs font-mono text-[#6b6b85]">
                      No data yet. Run "Fetch Index Options" or "Fetch Stock Options + Prices" first.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {optNames.map((name, i) => {
                        const idx = DEFAULT_INDICES.find(d => d.key === name);
                        return (
                          <button key={i} onClick={() => loadOptRows(name)}
                            className={`bg-[#111118] border rounded-xl p-4 transition-all text-left ${optCategory === 'index' ? 'border-[#4d9fff]/40 hover:border-[#4d9fff]' : 'border-[#ff8c42]/40 hover:border-[#ff8c42]'}`}>
                            <div className="text-2xl mb-2">{optCategory === 'index' ? '📈' : '📦'}</div>
                            <div className={`text-xs font-black mb-1 ${optCategory === 'index' ? 'text-[#4d9fff]' : 'text-[#ff8c42]'}`}>{idx?.name || name}</div>
                            <div className="text-[10px] font-mono text-[#6b6b85]">{name}</div>
                          </button>
                        );
                      })}
                    </div>
                  )
                )}

                {/* Level 3: Data rows */}
                {optView === 'rows' && (
                  optRowsLoading ? (
                    <div className="text-center py-12 text-xs font-mono text-[#6b6b85]">Loading...</div>
                  ) : (
                    <div>
                      {optRows.length > 0 && (
                        <div className="flex justify-end mb-2">
                          <button onClick={() => downloadAllCSV(optRows, selectedOptName)}
                            className="bg-[#4d9fff]/15 border border-[#4d9fff]/40 text-[#4d9fff] hover:bg-[#4d9fff]/25 rounded-lg px-3 py-1.5 text-[10px] font-bold font-mono">
                            ⬇ Download All ({optRows.length} days) as CSV
                          </button>
                        </div>
                      )}
                      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-x-auto">
                        <table className="w-full text-xs font-mono">
                          <thead><tr className="border-b border-[#1e1e2e]">
                            {['Expiry', 'Trade Date', 'Strikes', 'Source', 'Actions'].map(h => (
                              <th key={h} className="text-left px-4 py-3 text-[#6b6b85] uppercase font-normal whitespace-nowrap">{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {optRows.length === 0 ? (
                              <tr><td colSpan={5} className="text-center py-8 text-[#6b6b85]">No data yet — run auto-fetch to populate this index.</td></tr>
                            ) : optRows.map((row, i) => (
                              <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#f0c040]/5">
                                <td className="px-4 py-3 text-[#6b6b85]">{row.expiry}</td>
                                <td className="px-4 py-3 text-[#f0c040] font-bold">{row.trade_date}</td>
                                <td className="px-4 py-3 text-[#39d98a] font-bold">{row.strikeCount}</td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.uploaded_by === 'auto-fetch' ? 'bg-[#39d98a]/15 text-[#39d98a]' : 'bg-[#f0c040]/15 text-[#f0c040]'}`}>
                                    {row.uploaded_by === 'auto-fetch' ? 'AUTO' : 'MANUAL'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 flex gap-2">
                                  <button onClick={() => downloadRowCSV(row, selectedOptName)}
                                    className="text-[#4d9fff] hover:bg-[#4d9fff]/10 rounded px-2 py-1 text-[10px] font-bold">⬇ CSV</button>
                                  <button onClick={() => handleDeleteRow(row.id)}
                                    className="text-[#ff4d6d] hover:bg-[#ff4d6d]/10 rounded px-2 py-1 text-[10px] font-bold">Delete</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            {/* STOCK PRICES TAB */}
            {dbSubTab === 'prices' && (
              <div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[
                    { label: 'Total Records', value: dbPriceStats.total, color: '#4d9fff' },
                    { label: 'Stocks in Bank', value: dbPriceStats.stocks, color: '#39d98a' },
                  ].map((s, i) => (
                    <div key={i} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 text-center">
                      <div className="text-xs font-mono text-[#6b6b85] mb-1">{s.label}</div>
                      <div className="text-xl font-black" style={{ color: s.color }}>{s.value ?? 0}</div>
                    </div>
                  ))}
                </div>

                {priceView === 'rows' && (
                  <div className="flex items-center gap-2 mb-4 text-xs font-mono">
                    <button onClick={() => { setPriceView('stocks'); loadStockPrices(); }}
                      className="text-[#f0c040] hover:underline">← All Stocks</button>
                    <span className="text-[#6b6b85]">›</span>
                    <span className="text-[#e8e8f0] font-black">{selectedPriceStock}</span>
                    <span className="text-[#6b6b85]">({priceRowsForStock.length} records)</span>
                  </div>
                )}

                {dbPriceLoading ? (
                  <div className="text-center py-12 text-xs font-mono text-[#6b6b85]">Loading...</div>
                ) : priceView === 'stocks' ? (
                  priceStockNames.length === 0 ? (
                    <div className="text-center py-12 text-xs font-mono text-[#6b6b85]">No price data yet. Run "Fetch Stocks Data" first.</div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {priceStockNames.map((name, i) => (
                        <button key={i} onClick={() => openPriceStock(name)}
                          className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 hover:border-[#4d9fff] transition-all text-left">
                          <div className="text-2xl mb-2">📁</div>
                          <div className="text-xs font-black text-[#4d9fff]">{name}</div>
                          <div className="text-[10px] font-mono text-[#6b6b85] mt-1">Tap to view data</div>
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead><tr className="border-b border-[#1e1e2e]">
                        {['Date', 'Open', 'High', 'Low', 'Close', 'Volume'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[#6b6b85] uppercase font-normal whitespace-nowrap">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {priceRowsForStock.length === 0 ? (
                          <tr><td colSpan={6} className="text-center py-8 text-[#6b6b85]">No data</td></tr>
                        ) : priceRowsForStock.map((row, i) => (
                          <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#4d9fff]/5">
                            <td className="px-4 py-3 text-[#f0c040] font-bold">{row.trade_date}</td>
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
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 text-center">
                    <div className="text-xs font-mono text-[#6b6b85] mb-1">Total Records</div>
                    <div className="text-xl font-black text-[#a78bfa]">{dbFundStats.total ?? 0}</div>
                  </div>
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 text-center">
                    <div className="text-xs font-mono text-[#6b6b85] mb-1">Stocks in Bank</div>
                    <div className="text-xl font-black text-[#39d98a]">{fundStockNames.length}</div>
                  </div>
                </div>

                {fundView === 'rows' && (
                  <div className="flex items-center gap-2 mb-4 text-xs font-mono">
                    <button onClick={() => { setFundView('stocks'); loadFundamentals(); }}
                      className="text-[#f0c040] hover:underline">← All Stocks</button>
                    <span className="text-[#6b6b85]">›</span>
                    <span className="text-[#e8e8f0] font-black">{selectedFundStock}</span>
                    <span className="text-[#6b6b85]">({fundRowsForStock.length} records)</span>
                  </div>
                )}

                {dbFundLoading ? (
                  <div className="text-center py-12 text-xs font-mono text-[#6b6b85]">Loading...</div>
                ) : fundView === 'stocks' ? (
                  fundStockNames.length === 0 ? (
                    <div className="text-center py-12 text-xs font-mono text-[#6b6b85]">No fundamentals yet. Run "Fetch Fundamentals" first.</div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {fundStockNames.map((name, i) => (
                        <button key={i} onClick={() => openFundStock(name)}
                          className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 hover:border-[#a78bfa] transition-all text-left">
                          <div className="text-2xl mb-2">📊</div>
                          <div className="text-xs font-black text-[#a78bfa]">{name}</div>
                          <div className="text-[10px] font-mono text-[#6b6b85] mt-1">Tap to view data</div>
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead><tr className="border-b border-[#1e1e2e]">
                        {['Date', 'LTP', 'PE', 'EPS', 'Book Val', '52W H', '52W L', 'ROCE'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[#6b6b85] uppercase font-normal whitespace-nowrap">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {fundRowsForStock.length === 0 ? (
                          <tr><td colSpan={8} className="text-center py-8 text-[#6b6b85]">No data</td></tr>
                        ) : fundRowsForStock.map((row, i) => (
                          <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#a78bfa]/5">
                            <td className="px-4 py-3 text-[#f0c040] font-bold">{row.trade_date}</td>
                            <td className="px-4 py-3 font-bold">{row.ltp?.toFixed(2) ?? '-'}</td>
                            <td className="px-4 py-3">{row.pe_ratio?.toFixed(2) ?? '-'}</td>
                            <td className="px-4 py-3">{row.eps?.toFixed(2) ?? '-'}</td>
                            <td className="px-4 py-3">{row.book_value?.toFixed(2) ?? '-'}</td>
                            <td className="px-4 py-3 text-[#39d98a]">{row.week52_high?.toFixed(2) ?? '-'}</td>
                            <td className="px-4 py-3 text-[#ff4d6d]">{row.week52_low?.toFixed(2) ?? '-'}</td>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <button onClick={handleFetchIndices} disabled={fetchIndicesLoading}
                className="bg-[#f0c040] text-black font-black text-sm py-4 rounded-xl disabled:opacity-40">
                {fetchIndicesLoading ? 'Fetching...' : '📈 Fetch Index Options'}
              </button>
              <button onClick={handleFetchStockOptions} disabled={fetchStockOptLoading}
                className="bg-[#ff8c42] text-black font-black text-sm py-4 rounded-xl disabled:opacity-40">
                {fetchStockOptLoading ? 'Fetching...' : '📦 Fetch Stock Options'}
              </button>
              <button onClick={handleFetchStockPrices} disabled={fetchStockPriceLoading}
                className="bg-[#4d9fff] text-black font-black text-sm py-4 rounded-xl disabled:opacity-40">
                {fetchStockPriceLoading ? 'Fetching...' : '💹 Fetch Stock Prices'}
              </button>
              <button onClick={handleFetchFundamentals} disabled={fetchFundLoading}
                className="bg-[#a78bfa] text-black font-black text-sm py-4 rounded-xl disabled:opacity-40">
                {fetchFundLoading ? 'Fetching...' : '📊 Fetch Fundamentals'}
              </button>
              <button onClick={handleAutoFetch} disabled={fetchLoading}
                className="bg-[#39d98a] text-black font-black text-sm py-4 rounded-xl disabled:opacity-40 md:col-span-2 lg:col-span-2">
                {fetchLoading ? 'Fetching...' : '⚡ Fetch Everything (All)'}
              </button>
            </div>

            {fetchIndicesDone && fetchIndicesResults.length > 0 && (
              <div className="bg-[#111118] border border-[#f0c040]/30 rounded-xl p-5">
                <div className="text-xs font-mono font-bold mb-3 text-[#f0c040]">Index Options Results</div>
                <div className="text-xs font-mono font-bold mb-3 flex gap-4 flex-wrap">
                  <span className="text-[#39d98a]">{fetchIndicesResults.filter(r => r.status === 'saved').length} saved</span>
                  <span className="text-[#f0c040]">{fetchIndicesResults.filter(r => r.status === 'duplicate').length} duplicates</span>
                  <span className="text-[#6b6b85]">{fetchIndicesResults.filter(r => r.status === 'empty').length} empty</span>
                  <span className="text-[#ff4d6d]">{fetchIndicesResults.filter(r => r.status === 'error').length} errors</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {fetchIndicesResults.map((r, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono ${r.status === 'saved' ? 'bg-[#39d98a]/10 text-[#39d98a]' : r.status === 'duplicate' ? 'bg-[#f0c040]/10 text-[#f0c040]' : r.status === 'empty' ? 'bg-[#6b6b85]/10 text-[#6b6b85]' : 'bg-[#ff4d6d]/10 text-[#ff4d6d]'}`}>
                      <span>{r.index}{r.expiry ? ' | ' + r.expiry : ''}</span>
                      <span>{r.status === 'saved' ? 'Saved' + (r.strikes ? ' (' + r.strikes + ')' : '') : r.status === 'duplicate' ? 'Already exists' : r.status === 'empty' ? 'Market closed' : 'Error: ' + (r.error || '')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fetchStockOptDone && fetchStockOptResults.length > 0 && (
              <div className="bg-[#111118] border border-[#ff8c42]/30 rounded-xl p-5">
                <div className="text-xs font-mono font-bold mb-3 text-[#ff8c42]">Stock Options Results</div>
                <div className="text-xs font-mono font-bold mb-3 flex gap-4 flex-wrap">
                  <span className="text-[#39d98a]">{fetchStockOptResults.filter(r => r.status === 'saved').length} saved</span>
                  <span className="text-[#f0c040]">{fetchStockOptResults.filter(r => r.status === 'duplicate').length} duplicates</span>
                  <span className="text-[#6b6b85]">{fetchStockOptResults.filter(r => r.status === 'empty').length} empty</span>
                  <span className="text-[#ff4d6d]">{fetchStockOptResults.filter(r => r.status === 'error').length} errors</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {fetchStockOptResults.map((r, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono ${r.status === 'saved' ? 'bg-[#39d98a]/10 text-[#39d98a]' : r.status === 'duplicate' ? 'bg-[#f0c040]/10 text-[#f0c040]' : r.status === 'empty' ? 'bg-[#6b6b85]/10 text-[#6b6b85]' : 'bg-[#ff4d6d]/10 text-[#ff4d6d]'}`}>
                      <span>{r.index}{r.expiry ? ' | ' + r.expiry : ''}</span>
                      <span>{r.status === 'saved' ? 'Saved' + (r.strikes ? ' (' + r.strikes + ')' : '') : r.status === 'duplicate' ? 'Already exists' : r.status === 'empty' ? 'No data' : 'Error: ' + (r.error || '')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fetchStockPriceDone && fetchStockPriceResults.length > 0 && (
              <div className="bg-[#111118] border border-[#4d9fff]/30 rounded-xl p-5">
                <div className="text-xs font-mono font-bold mb-3 text-[#4d9fff]">Stock Prices Results</div>
                <div className="text-xs font-mono font-bold mb-3 flex gap-4 flex-wrap">
                  <span className="text-[#39d98a]">{fetchStockPriceResults.filter(r => r.status === 'saved' || r.status === 'updated').length} saved/updated</span>
                  <span className="text-[#6b6b85]">{fetchStockPriceResults.filter(r => r.status === 'empty').length} empty</span>
                  <span className="text-[#ff4d6d]">{fetchStockPriceResults.filter(r => r.status === 'error').length} errors</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {fetchStockPriceResults.map((r, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono ${r.status === 'saved' || r.status === 'updated' ? 'bg-[#39d98a]/10 text-[#39d98a]' : r.status === 'empty' ? 'bg-[#6b6b85]/10 text-[#6b6b85]' : 'bg-[#ff4d6d]/10 text-[#ff4d6d]'}`}>
                      <span>{r.index}</span>
                      <span>{r.status === 'saved' ? 'Saved' : r.status === 'updated' ? 'Updated' : r.status === 'empty' ? 'No data' : 'Error: ' + (r.error || '')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
