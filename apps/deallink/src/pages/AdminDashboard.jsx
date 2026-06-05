import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AdminShell from '../components/AdminShell.jsx';
import { useStore, useToast } from '../store.jsx';
import { Kicker, Status, Tag } from '../components/ui.jsx';
import api from '../lib/api.js';
import NotificationBell from '../components/NotificationBell.jsx';

function ReferralTracker() {
  const [referralUrl, setReferralUrl] = React.useState(null);
  const [stats, setStats] = React.useState({ total: 0, activated: 0, pending: 0 });
  const [loading, setLoading] = React.useState(true);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    Promise.all([
      api.get('/deallink/referrals/my-link').catch(() => ({ data: { referral_url: null } })),
      api.get('/deallink/referrals/stats').catch(() => ({ data: { total: 0, activated: 0, pending: 0 } })),
    ]).then(([linkRes, statsRes]) => {
      setReferralUrl(linkRes.data.referral_url);
      setStats(statsRes.data);
    }).finally(() => setLoading(false));
  }, []);

  const handleCopy = () => {
    if (!referralUrl) return;
    navigator.clipboard.writeText(referralUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const FOUNDING_THRESHOLD = 3;
  const activated = stats.activated || 0;
  const progressPct = Math.min((activated / FOUNDING_THRESHOLD) * 100, 100);
  const earned = activated >= FOUNDING_THRESHOLD;

  const GOLD = '#b8860b';
  const GOLD_LIGHT = '#fef9ec';
  const GOLD_BORDER = '#d4a843';

  if (loading) return null;

  return (
    <div style={{
      margin: '0 24px 20px',
      background: GOLD_LIGHT,
      border: `1px solid ${GOLD_BORDER}`,
      borderRadius: 8,
      padding: '20px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 18 }}>🤝</span>
        <span style={{ fontWeight: 700, fontSize: 15, color: GOLD }}>Invite wholesalers to REI Flywheel</span>
      </div>

      {referralUrl === null ? (
        <div style={{ fontSize: 13, color: 'var(--mute)', marginTop: 8 }}>
          Set your handle in profile settings to get your referral link.{' '}
          <Link to="/admin/profile" style={{ color: GOLD, fontWeight: 600 }}>Go to profile →</Link>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <input
              readOnly
              value={referralUrl}
              style={{
                flex: 1,
                fontSize: 13,
                background: '#fff',
                border: `1px solid ${GOLD_BORDER}`,
                borderRadius: 4,
                padding: '7px 10px',
                color: 'var(--ink)',
                minWidth: 0,
              }}
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={handleCopy}
              style={{
                background: GOLD,
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                padding: '7px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>

          <div style={{ marginTop: 14 }}>
            {earned ? (
              <div style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>
                🏆 Founding Member badge earned!
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: GOLD, marginBottom: 6, fontWeight: 600 }}>
                  <span>{activated} of {FOUNDING_THRESHOLD} referrals activated</span>
                  <span>{FOUNDING_THRESHOLD - activated} to go</span>
                </div>
                <div style={{ background: '#e8d9a0', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                  <div style={{
                    width: `${progressPct}%`,
                    height: '100%',
                    background: GOLD,
                    borderRadius: 99,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 6 }}>
                  Get your Founding Member badge at {FOUNDING_THRESHOLD} active referrals
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function NotificationsSection() {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    api.get('/deallink/notifications')
      .then(r => setItems(Array.isArray(r.data) ? r.data.slice(0, 5) : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading || items.length === 0) return null;

  const unreadCount = items.filter(n => !n.read).length;
  const priority = items.filter(n => ['offer_received', 'contract_deadline'].includes(n.type));
  const activity = items.filter(n => !['offer_received', 'contract_deadline'].includes(n.type));

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

  const renderRow = (n, i) => {
    const isPriority = ['offer_received', 'contract_deadline'].includes(n.type);
    const cnt = n.count || 1;
    const isRead = n.read ?? false;
    return (
      <div key={n.id ?? i} style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '9px 0',
        borderBottom: '1px solid var(--line)',
        opacity: isRead ? 0.6 : 1,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4,
          background: isRead ? 'transparent' : isPriority ? '#3478f6' : '#b8860b',
          border: isRead ? '1.5px solid var(--line)' : 'none',
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: isRead ? 400 : 600, color: 'var(--ink)', flex: 1 }}>
              {n.title || 'Notification'}
            </span>
            {cnt > 1 && (
              <span style={{
                background: isPriority ? 'rgba(52,120,246,0.12)' : 'rgba(184,134,11,0.12)',
                color: isPriority ? '#3478f6' : '#b8860b',
                fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '1px 6px',
              }}>{cnt}</span>
            )}
            <span style={{ fontSize: 11, color: 'var(--mute)', flexShrink: 0 }}>{relTime(n.created_at)}</span>
          </div>
          {n.body && <p style={{ fontSize: 12, color: 'var(--mute)', margin: '2px 0 0' }}>{n.body}</p>}
        </div>
      </div>
    );
  };

  return (
    <div style={{ margin: '0 24px 20px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', overflow: 'hidden' }}>
      <div
        onClick={() => setCollapsed(v => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer', borderBottom: collapsed ? 'none' : '1px solid var(--line)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Notifications</span>
          {unreadCount > 0 && (
            <span style={{ background: '#b8860b', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 7px' }}>
              {unreadCount} new
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: 'var(--mute)' }}>{collapsed ? 'Show ▾' : 'Hide ▴'}</span>
      </div>

      {!collapsed && (
        <div style={{ padding: '0 16px' }}>
          {priority.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#3478f6', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 0 2px' }}>
                Offers & Alerts
              </div>
              {priority.map(renderRow)}
            </>
          )}
          {activity.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 0 2px', marginTop: priority.length > 0 ? 4 : 0 }}>
                Activity
              </div>
              {activity.map(renderRow)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { state, dispatch } = useStore();
  const nav = useNavigate();
  const { show, node } = useToast();
  const [filter, setFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [menu, setMenu] = React.useState(null);

  const counts = state.deals.reduce((a, d) => { a[d.status] = (a[d.status] || 0) + 1; return a; }, {});
  const filtered = state.deals.filter(d => {
    if (filter !== 'all' && d.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${d.addr} ${d.zip} ${d.city}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <AdminShell tab="deals">
      <div style={{ padding: '24px 24px 14px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Kicker>{state.deals.length} deals · {counts.active || 0} active · {counts.pending || 0} pending · {counts.sold || 0} sold</Kicker>
          <div className="serif" style={{ fontSize: 28, marginTop: 6 }}>Inventory</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/admin/import" className="btn sm">Import CSV</Link>
          <Link to="/admin/deal/new" className="btn sm solid">+ Add deal</Link>
        </div>
      </div>

      <ReferralTracker />
      <NotificationsSection />

      <div style={{ padding: '0 24px 14px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['all', `All ${state.deals.length}`], ['active', `Active ${counts.active || 0}`], ['pending', `Pending ${counts.pending || 0}`], ['sold', `Sold ${counts.sold || 0}`]].map(([k, l]) => (
          <Tag key={k} active={filter === k} onClick={() => setFilter(k)}>{l}</Tag>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            placeholder="Search address, zip..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 240, fontSize: 12 }}
          />
        </div>
      </div>

      <div style={{ padding: '0 24px 24px', flex: 1 }}>
        {filtered.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', padding: 60, textAlign: 'center' }}>
            <div className="serif" style={{ fontSize: 20 }}>{state.deals.length === 0 ? 'No deals yet' : 'Nothing matches'}</div>
            <div style={{ fontSize: 13, color: 'var(--mute)', marginTop: 8 }}>
              {state.deals.length === 0 ? 'Add your first deal to get started.' : 'Try a different filter or search.'}
            </div>
            {state.deals.length === 0 && (
              <div style={{ display: 'inline-flex', gap: 8, marginTop: 18 }}>
                <Link to="/admin/deal/new" className="btn sm solid">+ Add deal</Link>
                <Link to="/admin/import" className="btn sm">Import CSV</Link>
              </div>
            )}
          </div>
        ) : (
          <div className="table" style={{ overflowX: 'auto' }}>
            <div className="row head" style={{ gridTemplateColumns: '2fr .8fr .6fr .8fr .8fr 1fr 60px', minWidth: 720 }}>
              <span>Address</span><span>ZIP</span><span>Type</span><span>Ask</span><span>ARV</span><span>Status</span><span></span>
            </div>
            {filtered.map(d => (
              <div key={d.id} className="row" style={{ gridTemplateColumns: '2fr .8fr .6fr .8fr .8fr 1fr 60px', minWidth: 720, position: 'relative' }}>
                <Link to={`/admin/deal/${d.id}`} className="ellipsis" style={{ fontWeight: 500, color: 'var(--ink)' }}>{d.addr}</Link>
                <span className="mono" style={{ color: 'var(--mute)' }}>{d.zip}</span>
                <span className="mono" style={{ color: 'var(--mute)' }}>{d.type}</span>
                <span className="mono">${d.ask}k</span>
                <span className="mono" style={{ color: 'var(--mute)' }}>${d.arv}k</span>
                <Status kind={d.status} />
                <div style={{ position: 'relative', textAlign: 'right' }}>
                  <button onClick={() => setMenu(menu === d.id ? null : d.id)} style={{ background: 'transparent', border: 'none', color: 'var(--dim)', fontSize: 18, cursor: 'pointer', padding: '0 6px' }}>⋯</button>
                  {menu === d.id && (
                    <div style={{ position: 'absolute', right: 0, top: '100%', background: 'var(--card)', border: '1px solid var(--line)', minWidth: 180, zIndex: 10, fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }} onMouseLeave={() => setMenu(null)}>
                      <Link to={`/admin/deal/${d.id}`} style={{ display: 'block', padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>Edit</Link>
                      <Link to={`/p/${state.profile.handle}/${d.id}`} target="_blank" style={{ display: 'block', padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>View public ↗</Link>
                      <button onClick={() => { dispatch({ type: 'update_profile', patch: { featuredId: d.id } }); setMenu(null); show('Featured updated'); }} style={{ display: 'block', padding: '10px 14px', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--line)' }}>Set as featured</button>
                      {['active', 'pending', 'sold'].filter(s => s !== d.status).map(s => (
                        <button key={s} onClick={() => { dispatch({ type: 'update_deal', id: d.id, patch: { status: s } }); setMenu(null); show(`Marked ${s}`); }} style={{ display: 'block', padding: '10px 14px', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--line)' }}>Mark {s}</button>
                      ))}
                      <button onClick={() => { if (confirm('Delete this deal?')) { dispatch({ type: 'remove_deal', id: d.id }); setMenu(null); show('Deal deleted'); } }} style={{ display: 'block', padding: '10px 14px', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--err)' }}>Delete</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {node}
    </AdminShell>
  );
}
