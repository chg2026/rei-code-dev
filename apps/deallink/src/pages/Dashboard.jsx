import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building2, Users, FileText, DollarSign, Plus, Upload,
  ArrowUp, ArrowDown, ChevronRight, MapPin, AlertCircle, Bell,
  TrendingUp, Eye, ArrowUpRight, Trash2, Check,
} from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useStore } from '../store.jsx';
import { Card, CardHeader, CardTitle, StatusBadge, Button } from '../components/ui.jsx';
import { formatCurrency } from '../lib/utils.js';
import api from '../lib/api.js';

const GOLD = '#b8860b';

function useCountUp(target, duration = 900) {
  const [val, setVal] = React.useState(0);
  React.useEffect(() => {
    const end = Number(target) || 0;
    if (end <= 0) { setVal(0); return; }
    const steps = 30;
    const stepMs = Math.max(16, Math.floor(duration / steps));
    const inc = end / steps;
    let current = 0;
    const id = setInterval(() => {
      current += inc;
      if (current >= end) { setVal(end); clearInterval(id); }
      else setVal(Math.floor(current));
    }, stepMs);
    return () => clearInterval(id);
  }, [target, duration]);
  return val;
}

function StatCard({ label, value, sub, icon: Icon }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[#6e6e73] text-xs font-medium uppercase tracking-wider">{label}</p>
          <p className="text-[#1d1d1f] text-3xl font-bold mt-2">{value}</p>
          {sub && <p className="text-[#86868b] text-xs mt-1">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-lg bg-[rgba(184,134,11,0.10)] text-[#b8860b] flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </Card>
  );
}

function ActivityCounter() {
  const [stats, setStats] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    api.get('/deallink/dashboard/stats')
      .then(({ data }) => { if (alive) setStats(data || {}); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const thisWeek = Number(stats?.profile_views_this_week) || 0;
  const lastWeek = Number(stats?.profile_views_last_week) || 0;
  const animated = useCountUp(thisWeek);
  const delta = thisWeek - lastWeek;
  const up = delta >= 0;
  return (
    <Card className="p-5 h-full">
      <p className="text-xs font-medium text-[#6e6e73] uppercase tracking-wider mb-3">Profile views</p>
      {!stats ? (
        <p className="text-[#86868b] text-sm">Loading…</p>
      ) : (
        <>
          <p className="text-[#1d1d1f] text-4xl font-bold text-[#b8860b]">{animated.toLocaleString()}</p>
          <p className="text-[#6e6e73] text-xs mt-1">this week</p>
          {delta !== 0 && (
            <span className={`inline-flex items-center gap-1 text-sm font-semibold mt-3 ${up ? 'text-[#22a06b]' : 'text-[#d4493a]'}`}>
              {up ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
              {Math.abs(delta).toLocaleString()} vs last week
            </span>
          )}
          {delta === 0 && lastWeek > 0 && <p className="text-[#86868b] text-xs mt-2">Same as last week</p>}
        </>
      )}
    </Card>
  );
}

function ActionInbox() {
  const [inbox, setInbox] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    api.get('/deallink/dashboard/action-inbox')
      .then(({ data }) => { if (alive) setInbox(data || {}); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const total = Number(inbox?.total) || 0;
  if (!inbox || total <= 0) return null;
  const rows = [
    { key: 'offers', icon: FileText, label: 'unreviewed offers', count: Number(inbox.unreviewed_offers) || 0, to: '/offers' },
    { key: 'leads', icon: Users, label: 'uncontacted leads', count: Number(inbox.uncontacted_leads) || 0, to: '/admin/leads' },
    { key: 'stale', icon: Building2, label: 'stale deals', count: Number(inbox.stale_deals) || 0, to: '/admin' },
  ];
  return (
    <Card className="mb-6 overflow-hidden" style={{ borderColor: 'rgba(184,134,11,0.35)', background: 'rgba(184,134,11,0.06)' }}>
      <div className="px-5 py-3 border-b border-[rgba(184,134,11,0.2)] flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-[#b8860b]" />
        <h2 className="text-[#1d1d1f] text-sm font-semibold">{total} thing{total === 1 ? '' : 's'} need your attention</h2>
      </div>
      <div className="flex divide-x divide-[rgba(184,134,11,0.15)]">
        {rows.filter(r => r.count > 0).map(({ key, icon: Icon, label, count, to }) => (
          <Link key={key} to={to} className="flex-1 flex items-center gap-3 px-5 py-3 hover:bg-[rgba(184,134,11,0.08)] transition-colors">
            <Icon className="w-4 h-4 text-[#b8860b] flex-shrink-0" />
            <span className="text-[#1d1d1f] text-sm"><span className="font-bold">{count}</span> {label}</span>
            <ChevronRight className="w-3 h-3 text-[#b8860b] ml-auto" />
          </Link>
        ))}
      </div>
    </Card>
  );
}

function NotificationsCard() {
  const nav = useNavigate();
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    api.get('/deallink/notifications')
      .then(r => setItems(Array.isArray(r.data) ? r.data.slice(0, 6) : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);
  function relTime(ts) {
    if (!ts) return '';
    const diff = Math.max(0, Date.now() - new Date(ts).getTime());
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }
  function getLink(n) {
    switch(n.type) {
      case 'profile_viewed': return '/admin/leads';
      case 'buyer_joined': return '/buyers';
      case 'buyer_viewed': return n.metadata?.deal_id ? `/admin/deal/${n.metadata.deal_id}` : '/admin';
      case 'offer_received': return '/offers';
      default: return '/admin';
    }
  }
  const priority = items.filter(n => ['offer_received', 'contract_deadline'].includes(n.type));
  const activity = items.filter(n => !['offer_received', 'contract_deadline'].includes(n.type));
  const hasBoth = priority.length > 0 && activity.length > 0;
  const renderRow = (n, i) => {
    const isPriority = ['offer_received', 'contract_deadline'].includes(n.type);
    const cnt = n.count || 1;
    const isRead = n.read ?? false;
    return (
      <div key={n.id ?? i} onClick={() => nav(getLink(n))} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
        className="hover:bg-[rgba(0,0,0,0.02)] rounded transition-colors px-1">
        <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5, background: isRead ? '#e5e7eb' : isPriority ? '#3478f6' : GOLD }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: isRead ? 400 : 600, color: '#1d1d1f', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
            {cnt > 1 && <span style={{ background: isPriority ? 'rgba(52,120,246,0.12)' : 'rgba(184,134,11,0.12)', color: isPriority ? '#3478f6' : GOLD, fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '1px 6px', flexShrink: 0 }}>{cnt}</span>}
          </div>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>{relTime(n.created_at)}</p>
        </div>
        <ArrowUpRight style={{ width: 12, height: 12, color: '#9ca3af', flexShrink: 0, marginTop: 4 }} />
      </div>
    );
  };
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#b8860b]" />
          <CardTitle>Notifications</CardTitle>
        </div>
      </CardHeader>
      <div className="px-5 pb-4">
        {loading ? (
          <p className="text-[#9ca3af] text-sm py-8 text-center">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-[#9ca3af] text-sm py-8 text-center">No activity yet. Share your link to get started.</p>
        ) : (
          <>
            {priority.length > 0 && (<>{hasBoth && <p style={{ fontSize: 10, fontWeight: 700, color: '#3478f6', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 0 2px' }}>Offers & Alerts</p>}{priority.map(renderRow)}</>)}
            {activity.length > 0 && (<>{hasBoth && <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 0 2px' }}>Activity</p>}{activity.map(renderRow)}</>)}
          </>
        )}
      </div>
    </Card>
  );
}

function MarketFeed() {
  const [deals, setDeals] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    api.get('/deallink/dashboard/market-feed')
      .then(({ data }) => {
        if (!alive) return;
        const list = Array.isArray(data) ? data : (data?.deals || []);
        setDeals(list.slice(0, 4));
      })
      .catch(() => setDeals([]));
    return () => { alive = false; };
  }, []);
  if (!deals || deals.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>New deals in your market</CardTitle>
        <Link to="/marketplace" className="text-[#b8860b] text-xs hover:underline">View all →</Link>
      </CardHeader>
      <div className="px-5 pb-5 grid grid-cols-2 gap-3">
        {deals.map((d, i) => {
          const id = d.id ?? d.dealId;
          const handle = d.seller?.handle || d.handle;
          const addr = d.addr || d.address || '—';
          const ask = Number(d.ask ?? d.asking_price) || 0;
          const type = d.type || d.property_type || '';
          const href = handle && id ? `/p/${handle}/${id}` : null;
          return (
            <a key={id ?? i} href={href || '#'} target={href ? '_blank' : undefined} rel="noreferrer"
              className="flex items-start gap-3 p-3 rounded-lg border border-[rgba(0,0,0,0.08)] hover:border-[#b8860b] transition-colors">
              <div className="w-8 h-8 bg-[rgba(0,0,0,0.06)] rounded-lg flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-[#6e6e73]" />
              </div>
              <div className="min-w-0">
                <p className="text-[#1d1d1f] text-xs font-medium truncate">{addr}</p>
                <p className="text-[#b8860b] text-sm font-bold mt-0.5">${ask.toLocaleString()}</p>
                {type && <p className="text-[#6e6e73] text-xs">{type}</p>}
              </div>
            </a>
          );
        })}
      </div>
    </Card>
  );
}

function ProfileStrength() {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    api.get('/deallink/dashboard/profile-score')
      .then(({ data: d }) => { if (alive) setData(d || {}); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!data) return null;
  const score = Math.max(0, Math.min(100, Number(data.score) || 0));
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Profile strength</p>
        <span className="text-[#1d1d1f] text-sm font-bold">{score}%</span>
      </div>
      <div className="w-full h-2 rounded-full bg-[rgba(0,0,0,0.08)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, background: GOLD }} />
      </div>
      {score < 100 && (
        <Link to="/admin/profile" className="inline-flex items-center gap-1 text-xs font-semibold text-[#b8860b] hover:underline mt-3">
          Complete your profile <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </Card>
  );
}

function MarketStatsCard() {
  const { state } = useStore();
  const [stats, setStats] = React.useState(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    api.get('/deallink/dashboard/stats')
      .then(({ data }) => setStats(data || {}))
      .catch(() => {});
  }, []);

  const totalArv = state.deals.reduce((s, d) => s + (Number(d.arv) || 0), 0);
  const views = Number(stats?.profile_views_this_week) || 0;

  function handleShare() {
    const text = [
      '📊 My REI Flywheel stats this week:',
      `🏠 ${state.deals.length} active deal${state.deals.length === 1 ? '' : 's'}`,
      `👥 ${state.buyers.length} buyer${state.buyers.length === 1 ? '' : 's'} in my network`,
      `👁 ${views} profile view${views === 1 ? '' : 's'} this week`,
      `💰 $${totalArv.toLocaleString()} ARV pipeline`,
      '',
      `See my deals → doorine.com/r/${state.profile?.handle || ''}`,
    ].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-medium text-[#6e6e73] uppercase tracking-wider">Market stats</p>
          <p className="text-[#1d1d1f] text-sm mt-1">Share your activity snapshot</p>
        </div>
        <button
          onClick={handleShare}
          style={{ background: copied ? '#22a06b' : '#b8860b', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}
        >
          {copied ? '✓ Copied!' : '📋 Copy & share'}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Deals', value: state.deals.length },
          { label: 'Buyers', value: state.buyers.length },
          { label: 'Views this week', value: views },
          { label: 'ARV pipeline', value: `$${(totalArv / 1000).toFixed(0)}k` },
        ].map(({ label, value }) => (
          <div key={label} className="text-center p-3 rounded-lg bg-[rgba(184,134,11,0.06)] border border-[rgba(184,134,11,0.15)]">
            <p className="text-[#1d1d1f] text-xl font-bold text-[#b8860b]">{value}</p>
            <p className="text-[#6e6e73] text-xs mt-1">{label}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ────────────── market alerts (copied from AdminProfile) ────────────── */

const ADMIN = {
  bg: '#ffffff',
  accent: '#b8860b',
  ink: '#1d1d1f',
  mute: '#6e6e73',
  inkStrong: '#1d1d1f',
};
const RAISED_SHADOW = '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)';
const INSET_SHADOW = 'inset 0 1px 4px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.08)';

const PROPERTY_TYPES = [
  { value: 'single_family', label: 'Single Family' },
  { value: 'multi_family',  label: 'Multi Family' },
  { value: 'commercial',    label: 'Commercial' },
  { value: 'land',          label: 'Land' },
];

function alertTypeLabel(type) {
  if (type === 'wholesaler_jv') return 'JV deals';
  if (type === 'buyer') return 'Buyer';
  return type || 'Alert';
}

function alertGeography(a) {
  const parts = [a.geography?.city, a.geography?.zip].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Anywhere';
}

function alertDetails(a) {
  const bits = [];
  const types = a.property_types || a.propertyTypes;
  if (Array.isArray(types) && types.length) {
    bits.push(types.map((t) => (PROPERTY_TYPES.find((p) => p.value === t)?.label || t)).join(', '));
  }
  const min = a.price_min ?? a.priceMin;
  const max = a.price_max ?? a.priceMax;
  if (min != null || max != null) {
    const fmt = (n) => `$${Number(n).toLocaleString()}`;
    if (min != null && max != null) bits.push(`${fmt(min)}–${fmt(max)}`);
    else if (min != null) bits.push(`${fmt(min)}+`);
    else bits.push(`up to ${fmt(max)}`);
  }
  return bits.join(' · ');
}

function MarketAlerts() {
  const [alerts, setAlerts] = React.useState([]);
  const [loadingAlerts, setLoadingAlerts] = React.useState(true);
  const [wh, setWh] = React.useState({ city: '', zip: '', jvOnly: false });
  const [buyer, setBuyer] = React.useState({ city: '', zip: '', types: [], priceMin: '', priceMax: '' });
  const [savingWh, setSavingWh] = React.useState(false);
  const [savingBuyer, setSavingBuyer] = React.useState(false);

  const loadAlerts = React.useCallback(async () => {
    setLoadingAlerts(true);
    try {
      const { data } = await api.get('/deallink/alerts');
      const list = Array.isArray(data) ? data : (data?.alerts || data?.items || []);
      setAlerts(list);
    } catch {
      setAlerts([]);
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  React.useEffect(() => { loadAlerts(); }, [loadAlerts]);

  async function saveWholesaler(e) {
    e?.preventDefault();
    setSavingWh(true);
    try {
      await api.post('/deallink/alerts', {
        alert_type: wh.jvOnly ? 'wholesaler_jv' : 'buyer',
        city: wh.city.trim() || null,
        zip: wh.zip.trim() || null,
      });
      setWh({ city: '', zip: '', jvOnly: false });
      loadAlerts();
    } catch {
      /* no toast on this page */
    } finally {
      setSavingWh(false);
    }
  }

  async function saveBuyer(e) {
    e?.preventDefault();
    setSavingBuyer(true);
    try {
      await api.post('/deallink/alerts', {
        alert_type: 'buyer',
        city: buyer.city.trim() || null,
        zip: buyer.zip.trim() || null,
        property_types: buyer.types,
        price_min: buyer.priceMin === '' ? null : Number(buyer.priceMin),
        price_max: buyer.priceMax === '' ? null : Number(buyer.priceMax),
      });
      setBuyer({ city: '', zip: '', types: [], priceMin: '', priceMax: '' });
      loadAlerts();
    } catch {
      /* no toast on this page */
    } finally {
      setSavingBuyer(false);
    }
  }

  async function toggleActive(a) {
    const id = a.id;
    const next = !(a.active ?? a.is_active ?? true);
    setAlerts((prev) => prev.map((x) => (x.id === id ? { ...x, active: next, is_active: next } : x)));
    try {
      await api.patch(`/deallink/alerts/${id}`, { active: next });
    } catch {
      setAlerts((prev) => prev.map((x) => (x.id === id ? { ...x, active: !next, is_active: !next } : x)));
    }
  }

  async function deleteAlert(id) {
    if (!window.confirm('Delete this alert?')) return;
    const prev = alerts;
    setAlerts((p) => p.filter((x) => x.id !== id));
    try {
      await api.delete(`/deallink/alerts/${id}`);
    } catch {
      setAlerts(prev);
    }
  }

  function toggleType(v) {
    setBuyer((b) => ({
      ...b,
      types: b.types.includes(v) ? b.types.filter((t) => t !== v) : [...b.types, v],
    }));
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Bell size={18} style={{ color: ADMIN.accent }} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: ADMIN.inkStrong, margin: 0 }}>Market Alerts</h2>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
        gap: 18,
      }}>
        {/* For wholesalers */}
        <NeuCard>
          <SectionTitle>For wholesalers</SectionTitle>
          <form onSubmit={saveWholesaler} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Label>City</Label>
                <NeuInput value={wh.city} onChange={(e) => setWh((s) => ({ ...s, city: e.target.value }))} placeholder="Cleveland" />
              </div>
              <div style={{ flex: 1 }}>
                <Label>ZIP</Label>
                <NeuInput value={wh.zip} onChange={(e) => setWh((s) => ({ ...s, zip: e.target.value }))} placeholder="44101" />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <Label>Only notify me about JV deals</Label>
                <div style={{ fontSize: 11, color: ADMIN.mute, lineHeight: 1.5 }}>
                  When on, you'll only hear about joint-venture wholesaler deals in this area.
                </div>
              </div>
              <NeuToggle on={wh.jvOnly} onChange={(v) => setWh((s) => ({ ...s, jvOnly: v }))} />
            </div>
            <NeuButton type="submit" gold disabled={savingWh} style={{ width: '100%' }}>
              {savingWh ? 'Saving…' : 'Save alert'}
            </NeuButton>
          </form>
        </NeuCard>

        {/* For buyers */}
        <NeuCard>
          <SectionTitle>For buyers</SectionTitle>
          <form onSubmit={saveBuyer} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Label>City</Label>
                <NeuInput value={buyer.city} onChange={(e) => setBuyer((s) => ({ ...s, city: e.target.value }))} placeholder="Cleveland" />
              </div>
              <div style={{ flex: 1 }}>
                <Label>ZIP</Label>
                <NeuInput value={buyer.zip} onChange={(e) => setBuyer((s) => ({ ...s, zip: e.target.value }))} placeholder="44101" />
              </div>
            </div>
            <div>
              <Label>Property types</Label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                {PROPERTY_TYPES.map(({ value, label }) => (
                  <NeuCheckbox
                    key={value}
                    checked={buyer.types.includes(value)}
                    onChange={() => toggleType(value)}
                    label={label}
                  />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Label>Min price</Label>
                <NeuInput type="number" value={buyer.priceMin} onChange={(e) => setBuyer((s) => ({ ...s, priceMin: e.target.value }))} placeholder="0" />
              </div>
              <div style={{ flex: 1 }}>
                <Label>Max price</Label>
                <NeuInput type="number" value={buyer.priceMax} onChange={(e) => setBuyer((s) => ({ ...s, priceMax: e.target.value }))} placeholder="500000" />
              </div>
            </div>
            <NeuButton type="submit" gold disabled={savingBuyer} style={{ width: '100%' }}>
              {savingBuyer ? 'Saving…' : 'Save alert'}
            </NeuButton>
          </form>
        </NeuCard>
      </div>

      {/* Existing alerts */}
      <NeuCard style={{ marginTop: 18 }}>
        <SectionTitle>Your alerts</SectionTitle>
        {loadingAlerts ? (
          <div style={{ fontSize: 13, color: ADMIN.mute }}>Loading…</div>
        ) : alerts.length === 0 ? (
          <div style={{ fontSize: 13, color: ADMIN.mute }}>No alerts yet. Create one above to get notified about new deals.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {alerts.map((a) => {
              const active = a.active ?? a.is_active ?? true;
              const details = alertDetails(a);
              return (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  borderRadius: 12, boxShadow: INSET_SHADOW, background: ADMIN.bg,
                  padding: '12px 14px',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
                        color: ADMIN.accent, background: 'rgba(184,134,11,0.12)',
                        padding: '2px 8px', borderRadius: 999,
                      }}>{alertTypeLabel(a.alert_type)}</span>
                      <span style={{ fontSize: 13, color: ADMIN.inkStrong, fontWeight: 500 }}>{alertGeography(a)}</span>
                    </div>
                    {details && <div style={{ fontSize: 11, color: ADMIN.mute }}>{details}</div>}
                  </div>
                  <NeuToggle on={active} onChange={() => toggleActive(a)} />
                  <button
                    type="button"
                    onClick={() => deleteAlert(a.id)}
                    title="Delete alert"
                    aria-label="Delete alert"
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: '#d4493a',
                    }}
                  >
                    <Trash2 style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </NeuCard>
    </div>
  );
}

function NeuCard({ children, style }) {
  return (
    <div style={{
      background: ADMIN.bg, borderRadius: 16,
      boxShadow: RAISED_SHADOW, padding: 20, ...style,
    }}>{children}</div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
      color: ADMIN.mute, fontFamily: 'JetBrains Mono, monospace',
      marginBottom: 14,
    }}>{children}</div>
  );
}

function Label({ children }) {
  return (
    <div style={{
      fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
      color: ADMIN.mute, fontFamily: 'JetBrains Mono, monospace',
      marginBottom: 6,
    }}>{children}</div>
  );
}

function NeuInput({ value, onChange, placeholder, type = 'text', readOnly = false, prefix }) {
  return (
    <div style={{
      borderRadius: 12, boxShadow: INSET_SHADOW, background: ADMIN.bg,
      display: 'flex', alignItems: 'center', padding: '10px 14px', gap: 8,
    }}>
      {prefix && <span style={{ color: ADMIN.mute, fontSize: 13 }}>{prefix}</span>}
      <input
        type={type}
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={readOnly}
        style={{
          flex: 1, background: 'transparent', border: 'none', outline: 'none',
          color: ADMIN.inkStrong, fontSize: 14, fontFamily: 'inherit',
          width: '100%', cursor: readOnly ? 'default' : 'text',
        }}
      />
    </div>
  );
}

function NeuButton({ children, onClick, type = 'button', gold = false, disabled = false, style }) {
  const [pressed, setPressed] = React.useState(false);
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        background: gold ? ADMIN.accent : ADMIN.bg,
        color: gold ? '#ffffff' : ADMIN.ink,
        fontWeight: gold ? 700 : 500, fontSize: 13, border: 'none',
        borderRadius: 12, padding: '10px 18px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: (pressed && !disabled) ? INSET_SHADOW : RAISED_SHADOW,
        transition: 'box-shadow 80ms ease',
        opacity: disabled ? 0.6 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontFamily: 'inherit', letterSpacing: gold ? 0.4 : 0,
        ...style,
      }}
    >{children}</button>
  );
}

function NeuToggle({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      style={{
        position: 'relative',
        width: 52, height: 28, borderRadius: 999,
        background: ADMIN.bg, border: 'none', cursor: 'pointer',
        boxShadow: INSET_SHADOW,
        padding: 0, flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 27 : 3,
        width: 22, height: 22, borderRadius: '50%',
        background: on ? ADMIN.accent : ADMIN.ink,
        boxShadow: '2px 2px 6px rgba(0,0,0,0.5)',
        transition: 'left 140ms ease, background 140ms ease',
      }} />
    </button>
  );
}

function NeuCheckbox({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'transparent', border: 'none', cursor: 'pointer',
        padding: '4px 0', fontFamily: 'inherit', textAlign: 'left',
      }}
    >
      <span style={{
        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
        boxShadow: checked ? 'none' : INSET_SHADOW,
        background: checked ? ADMIN.accent : ADMIN.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {checked && <Check style={{ width: 12, height: 12, color: '#ffffff' }} />}
      </span>
      <span style={{ fontSize: 13, color: ADMIN.ink }}>{label}</span>
    </button>
  );
}

export default function Dashboard() {
  const { state } = useStore();
  const { deals, buyers, offers, profile } = state;
  const counts = deals.reduce((a, d) => { a[d.status] = (a[d.status] || 0) + 1; return a; }, {});
  const totalArv = deals.reduce((s, d) => s + (Number(d.arv) || 0), 0);
  const recent = deals.slice(0, 5);

  return (
    <Layout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1d1d1f]">
              Welcome back{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}
            </h1>
            <p className="text-[#6e6e73] text-sm mt-1">Here's what's happening with your business.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/admin/import"><Button variant="secondary"><Upload className="w-4 h-4" /> Import CSV</Button></Link>
            <Link to="/admin/deal/new"><Button><Plus className="w-4 h-4" /> Add deal</Button></Link>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total deals" value={deals.length} sub={`${counts['Marketed'] || 0} marketed · ${counts['Under Contract'] || 0} under contract`} icon={Building2} />
          <StatCard label="Buyers" value={buyers.length} sub="In your network" icon={Users} />
          <StatCard label="Offers" value={offers.length} sub={`${offers.filter(o => o.status === 'Pending').length} pending`} icon={FileText} />
          <StatCard label="ARV pipeline" value={formatCurrency(totalArv)} sub="Total portfolio ARV" icon={DollarSign} />
        </div>

        {/* Action inbox — only shows when items need attention */}
        <ActionInbox />

        {/* Main content: Profile views + Notifications */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ActivityCounter />
          <div className="lg:col-span-2">
            <NotificationsCard />
          </div>
        </div>

        {/* Recent deals + Market feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent deals</CardTitle>
              <Link to="/admin" className="text-[#b8860b] text-xs hover:underline">View all →</Link>
            </CardHeader>
            <div className="divide-y divide-[rgba(0,0,0,0.08)]">
              {recent.length === 0 ? (
                <div className="px-5 py-10 text-center text-[#86868b] text-sm">
                  No deals yet. <Link to="/admin/deal/new" className="text-[#b8860b] hover:underline">Add your first deal</Link>.
                </div>
              ) : recent.map((d) => (
                <Link key={d.id} to={`/admin/deal/${d.id}`} className="px-5 py-3 flex items-center justify-between hover:bg-[rgba(0,0,0,0.03)] transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 bg-[rgba(0,0,0,0.06)] rounded-lg flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-[#6e6e73]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[#1d1d1f] text-sm font-medium truncate">{d.addr || '—'}</p>
                      <p className="text-[#6e6e73] text-xs truncate">{[d.city, d.state || d.zip].filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>
                  <div className="text-right hidden sm:block mr-4">
                    <p className="text-[#1d1d1f] text-sm font-semibold">${Number(d.ask || 0).toLocaleString()}</p>
                    <p className="text-[#6e6e73] text-xs">ARV ${Number(d.arv || 0).toLocaleString()}</p>
                  </div>
                  <StatusBadge status={d.status} />
                </Link>
              ))}
            </div>
          </Card>

          <div className="space-y-4">
            <ProfileStrength />
            <MarketFeed />
          </div>
        </div>

        {/* Market stats snapshot */}
        <MarketStatsCard />

        {/* Market alerts */}
        <Card>
          <CardHeader>
            <CardTitle>Market Alerts</CardTitle>
            <p className="text-[#6e6e73] text-xs">Get notified when new deals match your criteria</p>
          </CardHeader>
          <div className="px-5 pb-5">
            <MarketAlerts />
          </div>
        </Card>

      </div>
    </Layout>
  );
}
