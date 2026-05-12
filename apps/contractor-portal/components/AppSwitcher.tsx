"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type RoleFlag = "isInvestor" | "isContractor";

type Product = {
  code: string;
  name: string;
  tagline: string;
  color: string;
  initial: string;
  devPort?: number;
  devBareHost?: boolean;
  brandDomain?: string;
  productionUrl?: string;
  ssoEnabled?: boolean;
  requiredFlag?: RoleFlag;
  // Aliases used by the `products.code` rows in Supabase. account_products
  // joins to `products.code` which uses the longer "investor-portal" /
  // "contractor-portal" form, while this component uses the short "investor" /
  // "contractor" internally. enabledProducts membership tests against any of
  // these aliases (plus the canonical code) so either form works.
  aliases?: string[];
};

const PRODUCTS: Product[] = [
  {
    code: "chg",
    name: "CHG Platform",
    tagline: "Operations platform",
    color: "#0C447C",
    initial: "C",
    devBareHost: true,
    productionUrl: (process.env.NEXT_PUBLIC_CHG_URL || "").replace(/\/$/, "") || undefined,
  },
  {
    code: "deallink",
    name: "Deal Link",
    tagline: "Wholesaler deal links",
    color: "#16A34A",
    initial: "D",
    devPort: 3001,
    ssoEnabled: true,
    productionUrl: (process.env.NEXT_PUBLIC_DEALLINK_URL || "").replace(/\/$/, "") || undefined,
  },
  {
    code: "investor",
    name: "Investor Portal",
    tagline: "Dashboard & returns",
    color: "#7C3AED",
    initial: "I",
    devPort: 3002,
    ssoEnabled: true,
    requiredFlag: "isInvestor",
    aliases: ["investor-portal"],
    productionUrl: (process.env.NEXT_PUBLIC_INVESTOR_URL || "").replace(/\/$/, "") || undefined,
  },
  {
    code: "contractor",
    name: "Contractor Portal",
    tagline: "Job tracking & invoices",
    color: "#D97706",
    initial: "C",
    devPort: 3003,
    ssoEnabled: true,
    requiredFlag: "isContractor",
    aliases: ["contractor-portal"],
    productionUrl: (process.env.NEXT_PUBLIC_CONTRACTOR_URL || "").replace(/\/$/, "") || undefined,
  },
];

function resolveUrl(product: Product): string | null {
  if (product.productionUrl) return product.productionUrl;
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (!/\.replit\.dev$/.test(host)) return null;
  if (product.devBareHost) return `https://${host}`;
  if (product.devPort) return `https://${host}:${product.devPort}`;
  return null;
}

async function openWithSso(baseHref: string): Promise<void> {
  const win = window.open("about:blank", "_blank");
  if (!win) {
    window.location.href = `${baseHref}/login`;
    return;
  }
  try {
    const supabase = getSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token && session?.refresh_token) {
      const params = new URLSearchParams([
        ["access_token", session.access_token],
        ["refresh_token", session.refresh_token],
        ["token_type", "bearer"],
        ["expires_in", String(session.expires_in ?? 3600)],
      ]);
      win.location.href = `${baseHref}/login#${params.toString()}`;
    } else {
      win.location.href = `${baseHref}/login`;
    }
  } catch {
    win.location.href = `${baseHref}/login`;
  }
}

function matchesCurrent(product: Product, currentProduct: string): boolean {
  if (product.code === currentProduct) return true;
  if (product.aliases?.includes(currentProduct)) return true;
  return false;
}

function isEnabled(product: Product, enabledProducts: string[]): boolean {
  // Fail-closed: an empty entitlement list means "no cross-product access",
  // not "show everything". The current product is always shown by the caller
  // regardless (so the user can still see where they are).
  if (enabledProducts.includes(product.code)) return true;
  if (product.aliases?.some((a) => enabledProducts.includes(a))) return true;
  return false;
}

export default function AppSwitcher({
  currentProduct = "contractor-portal",
  enabledProducts = [],
  isInvestor = false,
  isContractor = false,
}: {
  currentProduct?: string;
  enabledProducts?: string[];
  isInvestor?: boolean;
  isContractor?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });

  // Close on outside click.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useLayoutEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const inWrap = wrapRef.current?.contains(e.target as Node);
      const inDrop = dropRef.current?.contains(e.target as Node);
      if (!inWrap && !inDrop) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Position the dropdown so it never overflows the viewport. The trigger
  // lives in a left-side sidebar, so we open to the RIGHT of the trigger by
  // default and clamp inside the viewport on small screens.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const width = 288;
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Prefer opening to the right of the trigger; if it would overflow,
    // fall back to clamping inside the viewport.
    let left = rect.right + 6;
    if (left + width + margin > vw) {
      left = Math.max(margin, vw - width - margin);
    }
    if (left < margin) left = margin;
    let top = rect.top;
    // If the dropdown is taller than remaining viewport, anchor it above.
    const estHeight = 360;
    if (top + estHeight > vh - margin) {
      top = Math.max(margin, vh - estHeight - margin);
    }
    setDropStyle({
      position: "fixed",
      left,
      top,
      width,
      visibility: "visible",
    });
  }, [open]);

  const roleFlags: Record<RoleFlag, boolean> = { isInvestor, isContractor };

  // Filter visible tiles: required role flag must match, AND (when an
  // entitlement list is provided) the tile must be enabled. The current
  // product is always shown so the user can see "where they are".
  const visibleProducts = PRODUCTS.filter((p) => {
    if (matchesCurrent(p, currentProduct)) return true;
    if (p.requiredFlag && !roleFlags[p.requiredFlag]) return false;
    if (!isEnabled(p, enabledProducts)) return false;
    return true;
  });

  return (
    <div style={{ position: "relative" }} ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="App switcher"
        aria-expanded={open}
        title="Switch apps"
        style={{
          background: "transparent",
          border: "none",
          color: "#374151",
          cursor: "pointer",
          padding: 6,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "#f3f4f6";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="5" r="1.75" />
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="19" cy="5" r="1.75" />
          <circle cx="5" cy="12" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="19" cy="12" r="1.75" />
          <circle cx="5" cy="19" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
          <circle cx="19" cy="19" r="1.75" />
        </svg>
      </button>

      {open && (
        <div
          ref={dropRef}
          style={{
            ...dropStyle,
            background: "#fff",
            color: "#111827",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
            padding: "8px 0",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              padding: "8px 16px",
              borderBottom: "1px solid #f3f4f6",
              fontSize: 11,
              fontWeight: 600,
              color: "#6b7280",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            CHG apps
          </div>

          <div style={{ padding: "4px 0" }}>
            {visibleProducts.map((product) => {
              const isCurrent = matchesCurrent(product, currentProduct);
              const resolvedHref = resolveUrl(product);
              const href = product.brandDomain
                ? `https://${product.brandDomain}`
                : resolvedHref || undefined;
              const clickable = !isCurrent && !!href;
              const showComingSoon = !isCurrent && !href;

              const Inner = (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "12px 16px",
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      background: product.color,
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 18,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {product.initial}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>
                        {product.name}
                      </div>
                      {isCurrent && (
                        <span
                          style={{
                            fontSize: 10,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            fontWeight: 600,
                            color: "#0C447C",
                            background: "#E8F0FA",
                            padding: "2px 6px",
                            borderRadius: 4,
                          }}
                        >
                          Current
                        </span>
                      )}
                      {showComingSoon && (
                        <span
                          style={{
                            fontSize: 10,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            fontWeight: 600,
                            color: "#6b7280",
                            background: "#f3f4f6",
                            padding: "2px 6px",
                            borderRadius: 4,
                          }}
                        >
                          Coming soon
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginTop: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {product.tagline}
                    </div>
                  </div>
                </div>
              );

              if (clickable) {
                return (
                  <a
                    key={product.code}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      setOpen(false);
                      if (product.ssoEnabled) {
                        e.preventDefault();
                        openWithSso(href!);
                      }
                    }}
                    style={{
                      display: "block",
                      margin: "0 4px",
                      borderRadius: 8,
                      textDecoration: "none",
                      color: "inherit",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.background = "#f9fafb";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                    }}
                  >
                    {Inner}
                  </a>
                );
              }

              return (
                <div
                  key={product.code}
                  style={{
                    margin: "0 4px",
                    borderRadius: 8,
                    background: isCurrent ? "rgba(232,240,250,0.4)" : "transparent",
                    opacity: isCurrent ? 1 : 0.75,
                    cursor: "default",
                  }}
                >
                  {Inner}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
