import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { getSupabaseServerClient, getSupabaseAdminClient } from "./supabaseServer";
import type { CpAccount } from "@prisma/client";

export interface SessionContractor {
  id: string;
  email: string;
  contactName: string;
  companyName: string;
  phone?: string | null;
  trade?: string | null;
  planTier: string;
  status: string;
  contractorPortalEnabled: boolean;
  messagingEnabled: boolean;
  // Cross-product entitlements (codes from public.products) granted to the
  // account this contractor belongs to. Drives which tiles the AppSwitcher
  // renders. Empty array if no entitlements (or no account_id on the profile).
  accountProducts: string[];
}

/**
 * Load the set of product codes (e.g. "chg", "deallink", "investor-portal",
 * "contractor-portal") an account is currently entitled to. Joins
 * public.account_products → public.products and filters out non-active rows.
 *
 * Returns an empty array on error or when there are no active entitlements,
 * so the caller can pass the result straight into AppSwitcher's
 * `enabledProducts` prop without null-guarding.
 */
export async function loadAccountProductCodes(accountId: string | null | undefined): Promise<string[]> {
  if (!accountId) return [];
  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from("account_products")
      .select("status, products ( code )")
      .eq("account_id", accountId)
      .eq("status", "active");
    if (error) {
      console.warn("[contractor-auth] loadAccountProductCodes error:", error.message);
      return [];
    }
    const rows = (data ?? []) as Array<{ products: { code: string | null } | { code: string | null }[] | null }>;
    const codes = new Set<string>();
    for (const row of rows) {
      const products = row.products;
      if (!products) continue;
      const list = Array.isArray(products) ? products : [products];
      for (const p of list) {
        if (p?.code) codes.add(p.code);
      }
    }
    return Array.from(codes);
  } catch (err) {
    console.warn("[contractor-auth] loadAccountProductCodes failed:", (err as Error).message);
    return [];
  }
}

const cache = new WeakMap<Headers, SessionContractor | null>();

export async function getCurrentContractor(): Promise<SessionContractor | null> {
  const h = await headers();
  if (cache.has(h)) return cache.get(h)!;
  const r = await resolve();
  cache.set(h, r);
  return r;
}

async function resolve(): Promise<SessionContractor | null> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = getSupabaseAdminClient();
  type Row = { id: string; email: string | null; full_name: string | null; phone: string | null; account_id: string | null; is_contractor: boolean | null; status: string | null };
  const { data: profile } = await admin
    .from("user_profiles")
    .select("id, email, full_name, phone, account_id, is_contractor, status")
    .eq("id", user.id)
    .maybeSingle<Row>();
  if (!profile?.is_contractor) return null;
  if (profile.status === "suspended") return null;

  // Load cross-product entitlements for this account so the AppSwitcher
  // knows which tiles to show. Done in parallel-safe fashion below.
  const accountProducts = await loadAccountProductCodes(profile.account_id);

  // Mirror to Prisma CpAccount on first sign-in.
  let account: CpAccount | null = await prisma.cpAccount.findUnique({ where: { id: user.id } });
  if (!account) {
    const fullName = (profile.full_name || "").trim() || (profile.email || user.email || "Contractor");
    account = await prisma.cpAccount.upsert({
      where: { id: user.id },
      update: {
        email: profile.email || user.email || `${user.id}@unknown`,
        contactName: fullName,
        companyName: fullName,
        phone: profile.phone,
        lastLoginAt: new Date(),
      },
      create: {
        id: user.id,
        email: profile.email || user.email || `${user.id}@unknown`,
        contactName: fullName,
        companyName: fullName,
        phone: profile.phone,
        lastLoginAt: new Date(),
      },
    });
  } else {
    account = await prisma.cpAccount.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });
  }
  if (account.status === "Suspended") return null;

  return {
    id: account.id,
    email: account.email,
    contactName: account.contactName,
    companyName: account.companyName,
    phone: account.phone,
    trade: account.trade,
    planTier: account.planTier,
    status: account.status,
    contractorPortalEnabled: account.contractorPortalEnabled,
    messagingEnabled: account.messagingEnabled,
    accountProducts,
  };
}

export function publicOrigin(req: NextRequest | { headers: Headers }): string {
  const override = process.env.CONTRACTOR_PORTAL_BASE_URL?.trim() || process.env.APP_BASE_URL?.trim();
  if (override) return override.replace(/\/+$/, "");
  const xfHost = req.headers.get("x-forwarded-host");
  const hostHeader = xfHost || req.headers.get("host") || "";
  const proto =
    req.headers.get("x-forwarded-proto") ||
    (hostHeader.includes("localhost") || hostHeader.startsWith("0.") || hostHeader.startsWith("127.") ? "http" : "https");
  if (/:\d+$/.test(hostHeader)) return `${proto}://${hostHeader}`;
  const devDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (devDomain && process.env.NODE_ENV !== "production") {
    const port = Number(process.env.PORT) || 3003;
    return port !== 443 && port !== 80 ? `https://${devDomain}:${port}` : `https://${devDomain}`;
  }
  return `${proto}://${hostHeader}`;
}
