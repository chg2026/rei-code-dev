import React from 'react';
import { Link } from 'react-router-dom';
import { Lock, Sparkles, ArrowRight } from 'lucide-react';
import Layout from './Layout.jsx';
import { Card, Button, PageHeader } from './ui.jsx';

export function UpgradePromptCard({
  title = 'This feature requires a Personal or Team plan',
  body = "You're on the Free plan. Upgrade to unlock this feature and a lot more.",
  ctaLabel = 'Upgrade',
  ctaTo = '/billing',
  compact = false,
}) {
  return (
    <Card className={compact ? 'p-6' : 'p-10 text-center'}>
      <div className={compact ? 'flex items-start gap-4' : 'flex flex-col items-center'}>
        <div className={`w-12 h-12 rounded-xl bg-amber-400/10 flex items-center justify-center flex-shrink-0 ${compact ? '' : 'mx-auto'}`}>
          <Lock className="w-5 h-5 text-amber-400" />
        </div>
        <div className={`min-w-0 ${compact ? 'flex-1' : 'mt-4'}`}>
          <p className="text-white font-semibold text-base">{title}</p>
          <p className="text-slate-400 text-sm mt-2">{body}</p>
          <div className={`mt-5 flex gap-2 ${compact ? '' : 'justify-center'}`}>
            <Link to={ctaTo}><Button><Sparkles className="w-4 h-4" /> {ctaLabel} <ArrowRight className="w-4 h-4" /></Button></Link>
            <Link to="/dashboard"><Button variant="secondary">Back to dashboard</Button></Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function UpgradePrompt({ pageTitle, pageSubtitle, ...props }) {
  return (
    <Layout>
      {pageTitle && <PageHeader title={pageTitle} subtitle={pageSubtitle} />}
      <UpgradePromptCard {...props} />
    </Layout>
  );
}

export function UpgradeBanner({ message = 'Free plan — upgrade for full access', ctaTo = '/billing' }) {
  return (
    <div className="bg-gradient-to-r from-amber-500/10 to-amber-400/5 border border-amber-400/30 rounded-xl p-3 mb-6 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-amber-400/20 flex items-center justify-center flex-shrink-0"><Sparkles className="w-4 h-4 text-amber-400" /></div>
      <p className="flex-1 text-slate-200 text-xs">{message}</p>
      <Link to={ctaTo} className="bg-amber-400 hover:bg-amber-300 text-slate-900 font-semibold text-xs px-3 py-1.5 rounded-lg flex-shrink-0">Upgrade</Link>
    </div>
  );
}
