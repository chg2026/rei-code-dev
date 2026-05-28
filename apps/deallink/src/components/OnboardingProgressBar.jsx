import React from 'react';
import { ChevronUp, Trophy, Play } from 'lucide-react';
import { getTourState, setTourStep, TOUR_STEP_KEYS } from './OnboardingCard.jsx';

const GOLD = '#b8860b';
const GOLD_GLOW =
  '0 0 0 1px rgba(184,134,11,0.25), 0 8px 24px rgba(184,134,11,0.35), 0 2px 8px rgba(0,0,0,0.12)';

const STEP_LABELS = [
  { key: 'properties_list', label: 'Properties' },
  { key: 'deal_overview', label: 'Deal overview' },
  { key: 'deal_analysis', label: 'Deal analysis' },
  { key: 'deal_documents', label: 'Documents' },
  { key: 'deal_im', label: 'Investment memo' },
];

export default function OnboardingProgressBar() {
  const [state, setState] = React.useState(() => getTourState());
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    const onUpdate = () => setState(getTourState());
    window.addEventListener('rei_tour_update', onUpdate);
    return () => window.removeEventListener('rei_tour_update', onUpdate);
  }, []);

  const total = TOUR_STEP_KEYS.length;
  const completeCount = TOUR_STEP_KEYS.filter((k) => state[k] === 'complete').length;
  const allDone = completeCount === total;
  const pct = (completeCount / total) * 100;

  if (allDone && !expanded) {
    return (
      <div
        onClick={() => setExpanded(true)}
        style={{
          position: 'fixed',
          bottom: 20,
          left: 20,
          zIndex: 999,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          background: '#ffffff',
          border: `1.5px solid ${GOLD}`,
          borderRadius: 999,
          padding: '12px 22px',
          boxShadow: GOLD_GLOW,
          cursor: 'pointer',
          fontFamily: 'var(--sans, system-ui, sans-serif)',
          fontSize: 14,
          fontWeight: 700,
          color: GOLD,
          transform: 'translateZ(0)',
        }}
      >
        <Trophy size={16} color={GOLD} />
        Setup complete! 🎉
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: 20,
        zIndex: 999,
        fontFamily: 'var(--sans, system-ui, sans-serif)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 10,
      }}
    >
      {expanded && (
        <div
          style={{
            width: 260,
            borderRadius: 16,
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.97) 0%, rgba(255,248,220,0.95) 100%)',
            border: '1.5px solid rgba(184,134,11,0.2)',
            boxShadow:
              '0 12px 40px rgba(184,134,11,0.18), 0 2px 8px rgba(0,0,0,0.08)',
            padding: '14px 16px',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1d1d1f' }}>
              Getting started
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>
              {completeCount}/{total}
            </div>
          </div>

          {STEP_LABELS.map(({ key, label }) => {
            const status = state[key];
            const isComplete = status === 'complete';
            const isSkipped = status === 'dismissed';
            return (
              <div
                key={key}
                style={{
                  height: 36,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    border: `1.5px solid ${isComplete ? GOLD : 'rgba(0,0,0,0.2)'}`,
                    background: isComplete ? GOLD : 'transparent',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {isComplete ? '✓' : ''}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    color: isComplete ? '#1d1d1f' : '#6e6e73',
                    fontWeight: isComplete ? 600 : 500,
                  }}
                >
                  {label}
                </span>
                {isSkipped && (
                  <button
                    type="button"
                    onClick={() => setTourStep(key, undefined)}
                    aria-label={`Replay ${label}`}
                    title="Replay this step"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: `1.5px solid ${GOLD}`,
                      background: 'transparent',
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <Play size={9} color={GOLD} fill={GOLD} style={{ marginLeft: 1 }} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          background: '#ffffff',
          border: '1.5px solid rgba(184,134,11,0.3)',
          borderRadius: 40,
          padding: '10px 20px',
          boxShadow: GOLD_GLOW,
          cursor: 'pointer',
          transform: 'translateZ(0)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: GOLD,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            Getting started
          </span>
          <div
            style={{
              width: 120,
              height: 7,
              borderRadius: 99,
              background: 'rgba(184,134,11,0.15)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: GOLD,
                borderRadius: 99,
                filter: 'drop-shadow(0 0 4px rgba(184,134,11,0.6))',
                transition: 'width 240ms ease',
              }}
            />
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#1d1d1f',
              lineHeight: 1,
            }}
          >
            {completeCount} of {total} complete
          </span>
        </div>
        <ChevronUp
          size={16}
          color={GOLD}
          style={{
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 180ms ease',
          }}
        />
      </div>
    </div>
  );
}
