import React from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../lib/api.js';
import { Avatar, Kicker } from '../components/UI.jsx';

const MEDAL = {
  1: { label: '1st', color: '#d4a843' },
  2: { label: '2nd', color: '#9e9e9e' },
  3: { label: '3rd', color: '#b07c4f' },
};

function ordinal(n) {
  if (MEDAL[n]) return MEDAL[n].label;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function RankBadge({ rank }) {
  const medal = MEDAL[rank];
  const color = medal ? medal.color : 'rgba(255,255,255,0.25)';
  return (
    <div style={{
      width: 36,
      height: 36,
      borderRadius: '50%',
      border: `2px solid ${color}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      fontFamily: 'var(--mono)',
      fontSize: 11,
      fontWeight: 700,
      color,
      letterSpacing: 0.5,
    }}>
      {ordinal(rank)}
    </div>
  );
}

export default function Leaderboard() {
  const [entries, setEntries] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    fetch(`${API_BASE}/deallink/leaderboard`)
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => setError('Could not load leaderboard.'))
      .finally(() => setLoading(false));
  }, []);

  const GOLD = '#d4a843';
  const DARK = '#0d0d0d';
  const SURFACE = '#161616';
  const BORDER = 'rgba(255,255,255,0.08)';
  const DIM = 'rgba(255,255,255,0.35)';
  const MUTED = 'rgba(255,255,255,0.55)';

  return (
    <div style={{ minHeight: '100vh', background: DARK, color: '#f0ece3', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ padding: '20px 32px', display: 'flex', alignItems: 'center', borderBottom: `1px solid ${BORDER}` }}>
        <Link to="/" style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 600, color: GOLD }}>
          DealLink
        </Link>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <Link to="/login" className="btn sm">Sign in</Link>
          <Link to="/onboarding" className="btn sm solid">Claim your handle →</Link>
        </div>
      </header>

      {/* Banner */}
      <section style={{ padding: '56px 32px 40px', textAlign: 'center', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: GOLD, marginBottom: 14 }}>
          🏆 REI Flywheel
        </div>
        <h1 className="serif" style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 500, lineHeight: 1.1, margin: '0 0 12px', color: '#f5f0e8' }}>
          Top Wholesalers on REI Flywheel
        </h1>
        <p style={{ fontSize: 15, color: MUTED, margin: 0 }}>
          Ranked by deals closed, buyer connections, and referrals
        </p>
      </section>

      {/* Body */}
      <main style={{ flex: 1, maxWidth: 680, width: '100%', margin: '0 auto', padding: '40px 24px 60px' }}>
        {loading && (
          <div style={{ textAlign: 'center', color: DIM, fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: 1, paddingTop: 40 }}>
            Loading…
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', color: 'var(--err)', fontSize: 13, paddingTop: 40 }}>{error}</div>
        )}

        {!loading && !error && entries.length < 5 && (
          <div style={{
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: '48px 32px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>🌱</div>
            <div className="serif" style={{ fontSize: 22, color: '#f5f0e8', marginBottom: 10 }}>
              Leaderboard goes live when 20 wholesalers are active.
            </div>
            <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, maxWidth: 360, margin: '0 auto 24px' }}>
              Be one of the first. Claim your handle, post deals, and build your buyer list.
            </div>
            <Link to="/onboarding" className="btn solid sm">Claim your handle →</Link>
          </div>
        )}

        {!loading && !error && entries.length >= 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {entries.map((entry, i) => {
              const rank = i + 1;
              const medal = MEDAL[rank];
              const initials = entry.handle
                ? entry.handle.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase()
                : '??';

              return (
                <div
                  key={entry.handle}
                  style={{
                    background: rank <= 3 ? `${SURFACE}` : 'transparent',
                    border: rank <= 3 ? `1px solid ${medal.color}22` : `1px solid transparent`,
                    borderRadius: 8,
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    transition: 'background 0.15s',
                  }}
                >
                  <RankBadge rank={rank} />

                  <Avatar
                    size={40}
                    initials={initials}
                    src={entry.avatar_url}
                    style={{ flexShrink: 0 }}
                  />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 15, color: '#f5f0e8' }}>
                        @{entry.handle}
                      </span>
                      {entry.is_ambassador && (
                        <span style={{
                          fontSize: 11,
                          fontFamily: 'var(--mono)',
                          letterSpacing: 0.8,
                          textTransform: 'uppercase',
                          color: GOLD,
                          border: `1px solid ${GOLD}`,
                          borderRadius: 99,
                          padding: '1px 7px',
                          lineHeight: 1.6,
                        }}>
                          Ambassador
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 5, flexWrap: 'wrap' }}>
                      {[
                        ['Closed', entry.deals_closed],
                        ['Buyers', entry.buyer_list_count],
                        ['Referrals', entry.referrals_activated],
                      ].map(([label, val]) => (
                        <span key={label} style={{ fontSize: 12, color: DIM, fontFamily: 'var(--mono)' }}>
                          <span style={{ color: MUTED }}>{val}</span> {label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 13,
                    fontWeight: 700,
                    color: medal ? medal.color : MUTED,
                    flexShrink: 0,
                    textAlign: 'right',
                  }}>
                    {entry.total_score}
                    <div style={{ fontSize: 10, fontWeight: 400, color: DIM, marginTop: 1 }}>pts</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer style={{ padding: '24px 32px', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: DIM, fontFamily: 'var(--mono)' }}>
        <span>REI Flywheel · DealLink</span>
        <Link to="/login" style={{ color: DIM }}>Sign in</Link>
      </footer>
    </div>
  );
}
