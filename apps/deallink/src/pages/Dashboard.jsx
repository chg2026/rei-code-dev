import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, Users, FileText, TrendingUp, DollarSign, Plus, Upload, ArrowUpRight } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useStore } from '../store.jsx';
import { Card, CardHeader, CardTitle, StatusBadge, Button } from '../components/ui.jsx';
import { formatCurrency } from '../lib/utils.js';

function StatCard({ label, value, sub, icon: Icon, trend }) {
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
      {trend != null && (
        <div className="mt-3 inline-flex items-center gap-1 text-xs text-[#22a06b]">
          <TrendingUp className="w-3 h-3" />{trend}
        </div>
      )}
    </Card>
  );
}

function NotificationsCard() {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const nav = React.useRef(null);

  React.useEffect(() => {
    import('../lib/api.js').then(m => {
      const api = m.default;
      api.get('/deallink/notifications')
        .then(r => setItems(Array.isArray(r.data) ? r.data.slice(0, 6) : []))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    });
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
      <Link key={n.id ?? i} to={getLink(n)} className="flex items-start gap-3 py-3 px-1 hover:bg-[rgba(0,0,0,0.03)] rounded-lg transition-colors cursor-pointer" style={{ textDecoration: 'none', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 8px', borderRadius: 8, borderBottom: '1px solid #f3f4f6' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5, background: isRead ? '#e5e7eb' : isPriority ? '#3478f6' : '#b8860b' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: isRead ? 400 : 600, color: '#1d1d1f', flex: 1 }}>{n.title}</span>
            {cnt > 1 && <span style={{ background: isPriority ? 'rgba(52,120,246,0.12)' : 'rgba(184,134,11,0.12)', color: isPriority ? '#3478f6' : '#b8860b', fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '1px 6px' }}>{cnt}</span>}
          </div>
          {n.body && <p style={{ fontSize: 12, color: '#6e6e73', margin: '2px 0 0' }}>{n.body}</p>}
          <p style={{ fontSize: 11, color: '#9ca3af', margin: '3px 0 0' }}>{relTime(n.created_at)}</p>
        </div>
        <ArrowUpRight style={{ width: 14, height: 14, color: '#9ca3af', flexShrink: 0, marginTop: 4 }} />
      </Link>
    );
  };

  return (
    <Card className="lg:col-span-1">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <Link to="/admin/leads" style={{ fontSize: 12, color: '#b8860b', textDecoration: 'none' }}>View all →</Link>
      </CardHeader>
      <div style={{ padding: '0 8px 8px' }}>
        {loading ? (
          <p style={{ fontSize: 13, color: '#9ca3af', padding: '20px 8px', textAlign: 'center' }}>Loading…</p>
        ) : items.length === 0 ? (
          <p style={{ fontSize: 13, color: '#9ca3af', padding: '20px 8px', textAlign: 'center' }}>No activity yet. Share your link.</p>
        ) : (
          <>
            {priority.length > 0 && (
              <>
                {hasBoth && <p style={{ fontSize: 10, fontWeight: 700, color: '#3478f6', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 8px 2px' }}>Offers & Alerts</p>}
                {priority.map(renderRow)}
              </>
            )}
            {activity.length > 0 && (
              <>
                {hasBoth && <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 8px 2px' }}>Activity</p>}
                {activity.map(renderRow)}
              </>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { state } = useStore();
  const { deals, buyers, offers, profile } = state;

  const counts = deals.reduce((a, d) => { a[d.status] = (a[d.status] || 0) + 1; return a; }, {});
  const totalAsk = deals.reduce((s, d) => s + (Number(d.ask) || 0), 0);
  const totalArv = deals.reduce((s, d) => s + (Number(d.arv) || 0), 0);
  const recent = deals.slice(0, 6);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1d1d1f]">Welcome back{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}</h1>
            <p className="text-[#6e6e73] text-sm mt-1">Here's what's happening across your inventory.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/admin/import"><Button variant="secondary"><Upload className="w-4 h-4" /> Import CSV</Button></Link>
            <Link to="/admin/deal/new"><Button><Plus className="w-4 h-4" /> Add deal</Button></Link>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total deals" value={deals.length} sub={`${counts['Marketed'] || 0} marketed · ${counts['Under Contract'] || 0} under contract`} icon={Building2} />
          <StatCard label="Buyers" value={buyers.length} sub="In your network" icon={Users} />
          <StatCard label="Offers" value={offers.length} sub={`${offers.filter(o => o.status === 'Pending').length} pending`} icon={FileText} />
          <StatCard label="ARV pipeline" value={formatCurrency(totalArv)} sub={`${formatCurrency(totalAsk)} asking`} icon={DollarSign} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent deals</CardTitle>
              <Link to="/admin" className="text-[#b8860b] text-xs hover:underline">View all →</Link>
            </CardHeader>
            <div className="divide-y divide-[rgba(0,0,0,0.08)]">
              {recent.length === 0 && (
                <div className="px-5 py-12 text-center text-[#86868b] text-sm">
                  No deals yet. <Link to="/admin/deal/new" className="text-[#b8860b] hover:underline">Add your first deal</Link>.
                </div>
              )}
              {recent.map((d) => (
                <Link key={d.id} to={`/admin/deal/${d.id}`} className="px-5 py-3 flex items-center justify-between hover:bg-[rgba(0,0,0,0.03)] transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 bg-[rgba(0,0,0,0.06)] rounded-lg flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-[#6e6e73]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[#1d1d1f] text-sm font-medium truncate hover:text-[#b8860b]">{d.addr || '—'}</p>
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

          <NotificationsCard />
        </div>
      </div>
    </Layout>
  );
}
