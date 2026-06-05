// Buyer-side API client for the IM viewer + gate. Completely separate
// from the wholesaler axios instance (../lib/deallink-api.js) — buyer
// JWTs and wholesaler Supabase tokens never share a header.

const TOKEN_KEY = 'dl.buyer.token'

export function getBuyerToken() {
  try { return localStorage.getItem(TOKEN_KEY) || null } catch { return null }
}
export function setBuyerToken(token) {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY) } catch {}
}
export function clearBuyerToken() { setBuyerToken(null) }

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const t = getBuyerToken()
    if (t) headers.Authorization = `Bearer ${t}`
  }
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'https://rei-code-dev.replit.app'}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = null
  try { data = await res.json() } catch {}
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export const ImAPI = {
  // Public-or-buyer-authed deal lookup. Returns { gated, summary, deal? }.
  // Always sends the buyer token if we have one, so the server can decide
  // whether to return the full IM body or just the OG summary.
  getDeal(slug)              { return request(`/im/deal/${encodeURIComponent(slug)}`, { auth: true }) },
  logView(deal_id)           { return request('/im/log-view', { method: 'POST', body: { deal_id }, auth: true }) },

  sendCode(name, phone)      { return request('/auth/buyer/send-code',   { method: 'POST', body: { name, phone } }) },
  verifyCode(phone, code)    { return request('/auth/buyer/verify-code', { method: 'POST', body: { phone, code } }) },
  resendCode(phone)          { return request('/auth/buyer/resend-code', { method: 'POST', body: { phone } }) },
  unlockWholesaler()         { return request('/auth/buyer/unlock-wholesaler', { method: 'POST', auth: true }) },
  me()                       { return request('/auth/buyer/me', { auth: true }) },

  buyerDashboard()           { return request('/buyer/dashboard',     { auth: true }) },
  sharedDeals(limit, offset) { return request(`/buyer/shared-deals?limit=${limit||50}&offset=${offset||0}`, { auth: true }) },
}
