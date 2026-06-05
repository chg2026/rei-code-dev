import React from 'react';
import { Copy, Check, Share2, BookOpen, History } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { useStore } from '../store.jsx';
import { Card, Button, Modal, PageHeader } from '../components/ui.jsx';
import api from '../lib/api.js';

const TIPS = [
  {
    title: 'Always lead with ARV',
    body: 'Buyers decide in seconds. Put your ARV and spread front and center on every deal you share.',
  },
  {
    title: 'Photos close deals',
    body: 'Deals with 5+ photos get 3x more buyer inquiries. Take them with your phone — done is better than perfect.',
  },
  {
    title: 'Speed wins in wholesaling',
    body: 'The wholesaler who responds first wins the buyer. Set up notifications so you never miss a lead.',
  },
  {
    title: 'Your buyer list is your business',
    body: 'Build it before you need it. Share your profile link everywhere, every day.',
  },
  {
    title: 'JV to move deals faster',
    body: "Toggle JV on any deal you can't move alone. Other wholesalers bring buyers you don't have.",
  },
  {
    title: 'Follow up or lose out',
    body: '80% of deals close after the 3rd follow-up. Use your pipeline to track every buyer conversation.',
  },
];

const CONTENT_TYPE_LABELS = {
  deal_card: 'Deal card',
  milestone: 'Milestone',
  tip: 'Educational tip',
};

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ContentHub() {
  const { state } = useStore();
  const handle = state.profile?.handle || '';
  const [shareTip, setShareTip] = React.useState(null);

  return (
    <Layout>
      <PageHeader
        title="Content Hub"
        subtitle="Ready-to-share wholesaling tips and your share history"
      />

      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-4 h-4 text-[#b8860b]" />
          <h2 className="text-[#1d1d1f] font-semibold text-sm">Educational Tips</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {TIPS.map((tip) => (
            <Card key={tip.title} className="p-5 flex flex-col">
              <h3 className="text-[#1d1d1f] font-semibold text-sm mb-2">{tip.title}</h3>
              <p className="text-[#6e6e73] text-sm leading-relaxed flex-1">{tip.body}</p>
              <div className="mt-4 pt-4 border-t border-[rgba(0,0,0,0.08)]">
                <Button variant="secondary" onClick={() => setShareTip(tip)} className="w-full">
                  <Share2 className="w-4 h-4" /> Share as @{handle || 'you'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <ShareHistory deals={state.deals} />

      <ShareTipModal tip={shareTip} handle={handle} onClose={() => setShareTip(null)} />
    </Layout>
  );
}

function ShareHistory({ deals }) {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const dealAddr = React.useMemo(() => {
    const map = {};
    (deals || []).forEach((d) => { map[d.id] = d.addr; });
    return map;
  }, [deals]);

  React.useEffect(() => {
    let active = true;
    api.get('/deallink/content-shares')
      .then((res) => {
        if (!active) return;
        const data = Array.isArray(res.data) ? res.data : (res.data?.shares || res.data?.data || []);
        setRows(data);
      })
      .catch(() => { if (active) setError('Could not load your share history.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <History className="w-4 h-4 text-[#b8860b]" />
        <h2 className="text-[#1d1d1f] font-semibold text-sm">My Share History</h2>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-[#6e6e73] text-sm">Loading…</div>
        ) : error ? (
          <div className="py-12 text-center text-[#6e6e73] text-sm">{error}</div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[#1d1d1f] font-semibold text-sm">No shares yet</p>
            <p className="text-[#6e6e73] text-sm mt-1">Share a deal, tip, or milestone and it'll show up here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#86868b] text-xs uppercase tracking-wide border-b border-[rgba(0,0,0,0.08)]">
                  <th className="px-4 py-3 font-semibold">Content type</th>
                  <th className="px-4 py-3 font-semibold">Deal</th>
                  <th className="px-4 py-3 font-semibold">Platform</th>
                  <th className="px-4 py-3 font-semibold">Date shared</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const type = r.content_type || r.contentType;
                  const dealId = r.deal_id || r.dealId;
                  const addr = r.deal_address || r.dealAddress || (dealId ? dealAddr[dealId] : null);
                  const platform = r.platform || '—';
                  const date = r.created_at || r.createdAt || r.shared_at || r.sharedAt || r.date;
                  return (
                    <tr key={r.id || i} className="border-b border-[rgba(0,0,0,0.05)] last:border-0">
                      <td className="px-4 py-3 text-[#1d1d1f]">{CONTENT_TYPE_LABELS[type] || type || '—'}</td>
                      <td className="px-4 py-3 text-[#6e6e73] truncate max-w-[220px]" title={addr || ''}>{addr || '—'}</td>
                      <td className="px-4 py-3 text-[#6e6e73] capitalize">{String(platform).replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 text-[#6e6e73]">{fmtDate(date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}

function ShareTipModal({ tip, handle, onClose }) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => { if (tip) setCopied(false); }, [tip]);

  if (!tip) return null;

  const h = handle || 'you';
  const text = `${tip.body} — @${h} on REI Flywheel 🏠 doorine.com/r/${h}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal open={!!tip} onClose={onClose} title={`Share: ${tip.title}`}>
      <div className="space-y-4">
        <p className="text-[#6e6e73] text-sm">Copy this and post it anywhere — it's pre-formatted with your handle and link.</p>
        <textarea
          readOnly
          value={text}
          rows={4}
          className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-[rgba(0,0,0,0.02)] p-3 text-sm text-[#1d1d1f] resize-none focus:outline-none"
          onFocus={(e) => e.target.select()}
        />
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1">Close</Button>
          <Button onClick={copy} className="flex-1">
            {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy text</>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
