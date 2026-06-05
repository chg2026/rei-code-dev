// Buyer auth context — token + buyer profile, kept in localStorage so the
// IM gate isn't shown again after a refresh. Intentionally separate from
// the wholesaler AuthContext: a buyer session never grants wholesaler
// access (and vice versa).

import React from 'react';
import { ImAPI, getBuyerToken, setBuyerToken, clearBuyerToken } from '../lib/im-api.js';

const Ctx = React.createContext(null);

export function BuyerAuthProvider({ children }) {
  const [buyer, setBuyer] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      if (!getBuyerToken()) { setLoading(false); return; }
      try {
        const { buyer } = await ImAPI.me();
        setBuyer(buyer);
      } catch {
        clearBuyerToken();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const value = React.useMemo(() => ({
    buyer,
    loading,
    isAuthed: !!buyer,
    setSession({ token, buyer }) {
      setBuyerToken(token);
      setBuyer(buyer);
    },
    async refresh() {
      try { const { buyer } = await ImAPI.me(); setBuyer(buyer); } catch {}
    },
    signOut() { clearBuyerToken(); setBuyer(null); },
  }), [buyer, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBuyerAuth() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error('useBuyerAuth must be used inside <BuyerAuthProvider>');
  return v;
}
