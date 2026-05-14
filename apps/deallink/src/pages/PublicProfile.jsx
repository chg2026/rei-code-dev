import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Twitter, Linkedin, Instagram, Globe } from 'lucide-react';
import { PublicAPI } from '../lib/deallink-api.js';
import { initialsOf } from '../lib/utils.js';

const PALETTE = {
  bg: '#161b2e',
  accent: '#F5C518',
  ink: '#c8cfe8',
  mute: '#5a6180',
  inkStrong: '#eef0fa',
};
const RAISED_SHADOW = '-5px -5px 12px rgba(255,255,255,0.06), 5px 5px 12px rgba(0,0,0,0.55)';
const INSET_SHADOW = 'inset -3px -3px 8px rgba(255,255,255,0.06), inset 3px 3px 8px rgba(0,0,0,0.55)';
const DEAL_INSET = 'inset -2px -2px 6px rgba(255,255,255,0.05), inset 2px 2px 6px rgba(0,0,0,0.55)';

const SOCIAL_ICONS = {
  twitter: Twitter,
  linkedin: Linkedin,
  instagram: Instagram,
  website: Globe,
};

function backgroundStyleFor(profile) {
  const t = profile?.backgroundType || 'solid';
  const v = profile?.backgroundValue || '';
  if (t === 'gradient' && v) return { background: v };
  if (t === 'image' && v) return { background: `center/cover no-repeat url(${v})` };
  return { background: v || PALETTE.bg };
}

// Public, unauthenticated wholesaler profile page. Fetches from
// /api/deallink/public/:handle so RLS + the server's hide_street masking
// (in routes/deallink-public.js) are the source of truth.
export default function PublicProfile() {
  const { handle } = useParams();
  const [data, setData] = React.useState({ profile: null, deals: [] });
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [filter, setFilter] = React.useState('all');
  const [view, setView] = React.useState('cards');
  const [joinOpen, setJoinOpen] = React.useState(false);
  const [toast, setToast] = React.useState(null);

  function showToast(m) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    PublicAPI.getProfile(handle).then((res) => {
      if (cancelled) return;
      if (!res) { setNotFound(true); setLoading(false); return; }
      setData(res);
      setLoading(false);
    }).catch(() => { if (!cancelled) { setNotFound(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [handle]);

  if (loading) {
    return (
      <PageShell>
        <div style={{ textAlign: 'center', padding: 60, color: PALETTE.mute, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, letterSpacing: 1 }}>
          Loading…
        </div>
      </PageShell>
    );
  }

  if (notFound || !data.profile) {
    return (
      <PageShell>
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Kicker>Not found</Kicker>
          <div style={{ fontSize: 24, marginTop: 12, color: PALETTE.inkStrong, fontWeight: 600 }}>@{handle}</div>
          <div style={{ marginTop: 8, color: PALETTE.mute, fontSize: 13 }}>This profile doesn't exist.</div>
          <div style={{ marginTop: 20 }}>
            <Link to="/" style={{ color: PALETTE.accent, fontSize: 13, textDecoration: 'none' }}>← Back home</Link>
          </div>
        </div>
      </PageShell>
    );
  }

  const profile = data.profile;
  const visible = data.deals; // server already filters out sold/dead
  const displayInitials = profile.initials || initialsOf(profile.name || profile.handle || 'A');
  const links = profile.socialLinks || {};
  const socialEntries = Object.entries(links).filter(([k, v]) => SOCIAL_ICONS[k] && (v || '').trim());

  const featured = visible.find((d) => d.id === profile.featuredId) || null;
  const others = featured ? visible.filter((d) => d.id !== featured.id) : visible;

  const filtered = others.filter((d) => {
    if (filter === 'all') return true;
    if (filter === 'sfr') return d.type === 'SFR';
    if (filter === 'mf') return d.type === 'MF' || d.type === 'DUP';
    if (filter === 'under150') return d.ask < 150000;
    if (filter === 'vacant') return d.occ === 'Vacant';
    return true;
  });

  const uniqueMarkets = new Set(visible.map((d) => d.city).filter(Boolean)).size;
  const avgAsk = visible.length
    ? Math.round(visible.reduce((s, d) => s + (Number(d.ask) || 0), 0) / visible.length)
    : 0;

  const heroBg = backgroundStyleFor(profile);

  return (
    <PageShell heroBg={heroBg}>
      {/* Hero — avatar, handle, name, bio, socials, stats */}
      <section style={{
        ...heroBg,
        padding: '36px 22px 28px',
        textAlign: 'center',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: profile.avatarUrl ? `center/cover no-repeat url(${profile.avatarUrl})` : PALETTE.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#1a1208',
          fontWeight: 800,
          fontSize: 24,
          overflow: 'hidden',
          boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
        }}>
          {!profile.avatarUrl && displayInitials}
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>@{profile.handle}</div>
        {profile.name && profile.name !== profile.handle && (
          <div style={{ fontSize: 13, opacity: 0.78 }}>{profile.name}</div>
        )}
        {profile.bio && (
          <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5, maxWidth: 320 }}>{profile.bio}</div>
        )}

        {socialEntries.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            {socialEntries.map(([key, url]) => {
              const Icon = SOCIAL_ICONS[key];
              return (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={key}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.15)',
                    backdropFilter: 'blur(6px)',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none',
                  }}
                >
                  <Icon size={15} />
                </a>
              );
            })}
          </div>
        )}

        {/* Stats row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          background: 'rgba(0,0,0,0.28)',
          borderRadius: 14,
          padding: '12px 10px',
          marginTop: 8,
          width: '100%',
          maxWidth: 340,
        }}>
          <Stat label="Active" value={visible.length} />
          <Stat label="Markets" value={uniqueMarkets || '—'} />
          <Stat label="Avg Ask" value={avgAsk ? `$${(avgAsk / 1000).toFixed(0)}k` : '—'} />
        </div>

        <button
          onClick={() => setJoinOpen(true)}
          style={{
            marginTop: 10,
            background: PALETTE.accent,
            color: '#1a1208',
            border: 'none',
            borderRadius: 12,
            padding: '11px 22px',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 0.4,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(245,197,24,0.25)',
            fontFamily: 'inherit',
          }}
        >
          Join buyer list
        </button>
      </section>

      {/* Deals — neumorphic dark cards on slate */}
      <section style={{ background: PALETTE.bg, padding: '24px 18px 32px' }}>
        {featured && (
          <Link
            to={`/p/${profile.handle}/${featured.id}`}
            style={{
              display: 'block',
              padding: '16px 18px',
              borderRadius: 18,
              background: PALETTE.bg,
              boxShadow: RAISED_SHADOW,
              textDecoration: 'none',
              color: PALETTE.ink,
              marginBottom: 18,
              position: 'relative',
            }}
          >
            <span style={{
              position: 'absolute', top: 12, right: 12,
              background: PALETTE.accent, color: '#1a1208',
              padding: '3px 10px', borderRadius: 999,
              fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
              letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700,
            }}>Featured</span>
            <div style={{ fontSize: 15, fontWeight: 600, color: PALETTE.inkStrong, paddingRight: 80 }}>
              {featured.addr || 'Untitled deal'}
            </div>
            <div style={{ fontSize: 11, color: PALETTE.mute, marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
              {[featured.city, featured.units && `${featured.units}-unit`, featured.sqft && `${Number(featured.sqft).toLocaleString()}sf`]
                .filter(Boolean).join(' · ')}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 12, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, flexWrap: 'wrap' }}>
              <span><span style={{ color: PALETTE.mute }}>Ask </span><b style={{ color: PALETTE.inkStrong }}>${Number(featured.ask || 0).toLocaleString()}</b></span>
              <span><span style={{ color: PALETTE.mute }}>ARV </span><b style={{ color: PALETTE.inkStrong }}>${Number(featured.arv || 0).toLocaleString()}</b></span>
              <span><span style={{ color: PALETTE.mute }}>Spread </span><b style={{ color: PALETTE.accent }}>${Number((featured.arv || 0) - (featured.ask || 0)).toLocaleString()}</b></span>
            </div>
          </Link>
        )}

        <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {[
            ['all', `All ${others.length}`],
            ['sfr', 'SFR'],
            ['mf', 'MF / Duplex'],
            ['under150', '< $150k'],
            ['vacant', 'Vacant'],
          ].map(([k, l]) => (
            <Pill key={k} active={filter === k} onClick={() => setFilter(k)}>{l}</Pill>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <Kicker>Active Deals · {filtered.length}</Kicker>
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>
            <button
              onClick={() => setView('cards')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                color: view === 'cards' ? PALETTE.accent : PALETTE.mute,
                fontWeight: view === 'cards' ? 700 : 500, fontFamily: 'inherit' }}
            >Cards</button>
            <span style={{ color: PALETTE.mute }}> / </span>
            <button
              onClick={() => setView('table')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                color: view === 'table' ? PALETTE.accent : PALETTE.mute,
                fontWeight: view === 'table' ? 700 : 500, fontFamily: 'inherit' }}
            >Table</button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{
            marginTop: 14,
            padding: 28,
            borderRadius: 16,
            background: PALETTE.bg,
            boxShadow: INSET_SHADOW,
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 24, color: PALETTE.mute }}>∅</div>
            <div style={{ fontSize: 15, marginTop: 8, color: PALETTE.inkStrong, fontWeight: 600 }}>No active deals</div>
            <div style={{ fontSize: 12, marginTop: 6, color: PALETTE.mute }}>
              Check back next Monday — or join the buyer list to be notified.
            </div>
          </div>
        ) : view === 'cards' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {filtered.map((d) => (
              <DealCard key={d.id} deal={d} handle={profile.handle} />
            ))}
          </div>
        ) : (
          <div style={{
            marginTop: 12,
            borderRadius: 16,
            background: PALETTE.bg,
            boxShadow: INSET_SHADOW,
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 90px',
              padding: '10px 14px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9,
              color: PALETTE.mute,
              letterSpacing: 1,
              textTransform: 'uppercase',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <span>Address</span><span style={{ textAlign: 'right' }}>Ask / ARV</span>
            </div>
            {filtered.map((d, i) => (
              <Link
                key={d.id}
                to={`/p/${profile.handle}/${d.id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 90px',
                  padding: '12px 14px',
                  alignItems: 'center',
                  color: PALETTE.ink,
                  textDecoration: 'none',
                  borderBottom: i === filtered.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: PALETTE.inkStrong,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{d.addr || 'Untitled'}</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: PALETTE.mute, marginTop: 2 }}>
                    {[d.zip, d.beds && `${d.beds}/${d.baths}`].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: PALETTE.inkStrong }}>${Number(d.ask || 0).toLocaleString()}</div>
                  <div style={{ fontSize: 10, color: PALETTE.mute, marginTop: 2 }}>${Number(d.arv || 0).toLocaleString()}</div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div style={{
          marginTop: 28,
          textAlign: 'center',
          fontSize: 11,
          color: PALETTE.mute,
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: 0.6,
        }}>
          Powered by{' '}
          <Link to="/" style={{ color: PALETTE.ink, textDecoration: 'underline' }}>deallink.io</Link>
        </div>
      </section>

      {joinOpen && (
        <JoinListModal
          handle={profile.handle}
          onClose={() => setJoinOpen(false)}
          onSubmitted={() => { setJoinOpen(false); showToast("You're on the list"); }}
        />
      )}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          background: PALETTE.bg,
          color: PALETTE.inkStrong,
          padding: '10px 18px',
          borderRadius: 12,
          boxShadow: RAISED_SHADOW,
          fontSize: 13,
          zIndex: 100,
        }}>{toast}</div>
      )}
    </PageShell>
  );
}

function PageShell({ children, heroBg }) {
  // The outer background uses the hero background so non-mobile viewports
  // get a coordinated look. The inner frame stays slate for the deals area.
  return (
    <div style={{
      minHeight: '100vh',
      ...(heroBg || { background: PALETTE.bg }),
      padding: '24px 16px 40px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif',
    }}>
      <div style={{
        maxWidth: 460,
        margin: '0 auto',
        background: PALETTE.bg,
        borderRadius: 28,
        overflow: 'hidden',
        boxShadow: RAISED_SHADOW,
        color: PALETTE.ink,
      }}>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{value}</div>
      <div style={{
        fontSize: 9,
        letterSpacing: 1,
        textTransform: 'uppercase',
        opacity: 0.7,
        fontFamily: 'JetBrains Mono, monospace',
        marginTop: 2,
      }}>{label}</div>
    </div>
  );
}

function Kicker({ children }) {
  return (
    <div style={{
      fontSize: 10,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: PALETTE.mute,
      fontFamily: 'JetBrains Mono, monospace',
    }}>{children}</div>
  );
}

function Pill({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        background: PALETTE.bg,
        color: active ? PALETTE.accent : PALETTE.ink,
        border: 'none',
        borderRadius: 999,
        padding: '7px 14px',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.4,
        cursor: 'pointer',
        boxShadow: active ? INSET_SHADOW : RAISED_SHADOW,
        fontFamily: 'inherit',
        transition: 'box-shadow 120ms ease',
      }}
    >{children}</button>
  );
}

function DealCard({ deal, handle }) {
  return (
    <Link
      to={`/p/${handle}/${deal.id}`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        padding: '14px 16px',
        borderRadius: 16,
        background: PALETTE.bg,
        boxShadow: DEAL_INSET,
        textDecoration: 'none',
        color: PALETTE.ink,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: PALETTE.inkStrong,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>{deal.addr || 'Untitled deal'}</div>
          {deal.new && (
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 8,
              color: PALETTE.accent,
              background: 'rgba(245,197,24,0.15)',
              padding: '2px 6px',
              borderRadius: 999,
              letterSpacing: 0.6,
              flexShrink: 0,
            }}>NEW</span>
          )}
        </div>
        <div style={{
          fontSize: 10,
          color: PALETTE.mute,
          marginTop: 4,
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          {[deal.zip || deal.city, deal.type, deal.beds && `${deal.beds}/${deal.baths}`, deal.sqft && `${deal.sqft}sf`]
            .filter(Boolean).join(' · ')}
        </div>
      </div>
      <div style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: PALETTE.inkStrong }}>
          ${Number(deal.ask || 0).toLocaleString()}
        </div>
        <div style={{ fontSize: 10, color: PALETTE.mute, marginTop: 2 }}>
          ARV ${Number(deal.arv || 0).toLocaleString()}
        </div>
      </div>
    </Link>
  );
}

function JoinListModal({ handle, onClose, onSubmitted }) {
  const [first, setFirst] = React.useState('');
  const [last, setLast] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || !first.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await PublicAPI.submitLead(handle, { first, last, email, phone, buyerType: 'Cash', kind: 'buyer-list' });
      onSubmitted();
    } catch (err) {
      setError(err?.message || 'Failed to submit.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(8,10,20,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 380,
          background: PALETTE.bg,
          borderRadius: 20,
          boxShadow: RAISED_SHADOW,
          padding: 24,
          color: PALETTE.ink,
        }}
      >
        <Kicker>Join buyer list</Kicker>
        <div style={{ fontSize: 18, marginTop: 6, color: PALETTE.inkStrong, fontWeight: 600 }}>Get Monday's drops first.</div>
        <form onSubmit={submit} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <ModalField label="First name"><ModalInput value={first} onChange={(e) => setFirst(e.target.value)} required /></ModalField>
            <ModalField label="Last name"><ModalInput value={last} onChange={(e) => setLast(e.target.value)} /></ModalField>
          </div>
          <ModalField label="Email"><ModalInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></ModalField>
          <ModalField label="Phone"><ModalInput value={phone} onChange={(e) => setPhone(e.target.value)} /></ModalField>
          {error && <div style={{ fontSize: 12, color: '#f87171' }}>{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 4,
              background: PALETTE.accent,
              color: '#1a1208',
              border: 'none',
              borderRadius: 12,
              padding: '12px 20px',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 0.4,
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Subscribing…' : 'Subscribe'}
          </button>
        </form>
      </div>
    </div>
  );
}

function ModalField({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{
        fontSize: 10,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: PALETTE.mute,
        fontFamily: 'JetBrains Mono, monospace',
        marginBottom: 6,
      }}>{label}</div>
      {children}
    </label>
  );
}

function ModalInput(props) {
  return (
    <div style={{
      borderRadius: 12,
      boxShadow: INSET_SHADOW,
      background: PALETTE.bg,
      padding: '10px 14px',
    }}>
      <input
        {...props}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: PALETTE.inkStrong,
          fontSize: 14,
          fontFamily: 'inherit',
        }}
      />
    </div>
  );
}
