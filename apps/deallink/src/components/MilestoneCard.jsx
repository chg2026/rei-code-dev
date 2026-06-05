import React from 'react';
import html2canvas from 'html2canvas';
import { PartyPopper, Facebook, Linkedin, Link as LinkIcon, Download, Check } from 'lucide-react';
import api from '../lib/api.js';

const MILESTONES = {
  first_deal_posted: 'I just listed my first deal on REI Flywheel! \uD83C\uDFE0',
  first_deal_closed: 'Just closed my first deal on REI Flywheel! \uD83C\uDF89',
  buyer_list_50: 'My buyer list just hit 50 on REI Flywheel! \uD83D\uDCC8',
  buyer_list_100: '100 buyers on my list \u2014 REI Flywheel is working! \uD83D\uDD25',
  buyer_list_500: '500 buyers strong on REI Flywheel! \uD83D\uDE80',
};

export default function MilestoneCard({ milestone, profile, onClose }) {
  const cardRef = React.useRef(null);
  const [copied, setCopied] = React.useState(false);
  const [hint, setHint] = React.useState('');
  const [downloading, setDownloading] = React.useState(false);

  const type = milestone?.type;
  const message = MILESTONES[type] || 'Another milestone on REI Flywheel! \uD83C\uDF89';
  const handle = profile?.handle || '';
  const base = import.meta.env.VITE_DEALLINK_URL || '';
  const shareUrl = `${base}/p/${handle}`;

  function logShare(platform) {
    api.post('/deallink/content-shares', {
      content_type: 'milestone',
      milestone_type: type,
      platform,
    }).catch(() => {});
  }

  function openShare(url, platform) {
    logShare(platform);
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=520');
  }

  async function copyLink() {
    logShare('copy_link');
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setHint('Link copied to clipboard');
      setTimeout(() => { setCopied(false); setHint(''); }, 2000);
    } catch {
      setHint('Could not copy — please copy the link manually');
    }
  }

  async function downloadCard() {
    if (!cardRef.current) return;
    setDownloading(true);
    logShare('download');
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `rei-flywheel-${(type || 'milestone').replace(/_/g, '-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setHint('Card downloaded');
      setTimeout(() => setHint(''), 2000);
    } catch {
      setHint('Could not generate the image');
    } finally {
      setDownloading(false);
    }
  }

  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  const liUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative bg-white border border-[rgba(0,0,0,0.08)] rounded-2xl p-6 w-full max-w-sm shadow-2xl my-8">
        {/* ── The shareable card ── */}
        <div
          ref={cardRef}
          className="rounded-xl overflow-hidden border border-[rgba(0,0,0,0.08)] bg-white"
        >
          <div className="relative bg-gradient-to-br from-[#b8860b] to-[#9a7209] px-6 pt-7 pb-6 text-center">
            <div className="inline-flex w-16 h-16 rounded-full bg-white/20 items-center justify-center mb-4">
              <PartyPopper className="w-8 h-8 text-white" />
            </div>
            <p className="text-white font-bold text-lg leading-snug">{message}</p>
          </div>

          <div className="px-6 py-4 text-center">
            {handle && <p className="text-[#b8860b] font-semibold text-sm mb-1">@{handle}</p>}
            <p className="text-[11px] text-[#86868b]">
              {shareUrl.replace(/^https?:\/\//, '') || 'REI Flywheel'}
            </p>
          </div>
        </div>

        {/* ── Share buttons ── */}
        <div className="grid grid-cols-4 gap-2 mt-5">
          <ShareButton label="Facebook" onClick={() => openShare(fbUrl, 'facebook')}>
            <Facebook className="w-5 h-5" />
          </ShareButton>
          <ShareButton label="LinkedIn" onClick={() => openShare(liUrl, 'linkedin')}>
            <Linkedin className="w-5 h-5" />
          </ShareButton>
          <ShareButton label="Copy link" onClick={copyLink}>
            {copied ? <Check className="w-5 h-5" /> : <LinkIcon className="w-5 h-5" />}
          </ShareButton>
          <ShareButton label={downloading ? 'Saving…' : 'Download'} onClick={downloadCard} disabled={downloading}>
            <Download className="w-5 h-5" />
          </ShareButton>
        </div>

        <div className="h-4 mt-2 mb-1 text-center">
          {hint && <p className="text-[#b8860b] text-xs">{hint}</p>}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full px-4 py-2.5 rounded-lg bg-[#b8860b] text-white font-semibold hover:bg-[#9a7209] transition-colors mt-1"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function ShareButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex flex-col items-center gap-1.5 py-2.5 rounded-lg bg-[rgba(0,0,0,0.04)] hover:bg-[rgba(184,134,11,0.12)] text-[#3a3a3c] hover:text-[#b8860b] border border-[rgba(0,0,0,0.06)] transition-colors disabled:opacity-50"
    >
      {children}
      <span className="text-[10px] font-medium text-center leading-tight">{label}</span>
    </button>
  );
}
