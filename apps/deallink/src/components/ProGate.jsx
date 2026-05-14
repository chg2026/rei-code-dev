import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import UpgradePrompt from './UpgradePrompt.jsx';
import Layout from './Layout.jsx';

export default function ProGate({
  children,
  pageTitle,
  pageSubtitle,
  title,
  body,
}) {
  const { loading, isFreePlan } = useAuth();

  if (loading) {
    return (
      <Layout>
        <div className="py-32 text-center text-slate-400 text-xs font-mono">Loading…</div>
      </Layout>
    );
  }

  if (isFreePlan) {
    return (
      <UpgradePrompt
        pageTitle={pageTitle}
        pageSubtitle={pageSubtitle}
        title={title}
        body={body}
      />
    );
  }

  return children;
}
