import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import TopNav from "@/components/TopNav";
import AvatarDropdown from "@/components/AvatarDropdown";
import BillingStatusBanner from "@/components/BillingStatusBanner";
import BillingNoticeForTeammates from "@/components/BillingNoticeForTeammates";
import BillingNavIndicator from "@/components/BillingNavIndicator";
import BillingNavBadge from "@/components/BillingNavBadge";
import NotificationBell from "@/components/NotificationBell";
import AppSwitcher from "@/components/AppSwitcher";
import ProfileCompletionBanner from "@/components/ProfileCompletionBanner";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "CHG Platform",
  description: "Property rehab operations platform",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  let companyName: string | null = null;
  if (user?.companyId) {
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true },
    });
    companyName = company?.name ?? null;
  }

  if (!user) {
    // Login screen owns the full viewport (no top bar).
    return (
      <html lang="en">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
          <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        </head>
        <body style={{ display: "block", overflow: "auto" }}>{children}</body>
      </html>
    );
  }

  const isAdmin = user.role === "Admin";

  const initials =
    [(user.firstName || "")[0], (user.lastName || "")[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || (user.email || "U")[0].toUpperCase();

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email ||
    "User";

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body style={{ minHeight: "100vh" }}>
        <div className="app-shell">
          <TopNav user={user} companyName={companyName} />
          <div className="main-col">
            <div className="topbar">
              <form action="/search" method="GET" style={{ display: "flex", alignItems: "center", flex: 1, maxWidth: 400 }}>
                <div style={{ position: "relative", width: "100%" }}>
                  <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--stone)", pointerEvents: "none" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input name="q" type="search" placeholder="Search or ask AI anything…" style={{ width: "100%", padding: "7px 12px 7px 30px", fontSize: 12, border: "1px solid var(--border-1)", borderRadius: 8, background: "var(--paper)", color: "var(--ink)", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                </div>
              </form>
              {isAdmin ? <BillingNavIndicator /> : <BillingNavBadge />}
              <NotificationBell />
              <AppSwitcher
                currentProduct="chg"
                isInvestor={user.isInvestor ?? false}
                isContractor={user.isContractor ?? false}
                enabledProducts={user.isSuperAdmin ? ['chg', 'deallink', 'investor-portal', 'contractor-portal'] : (user.accountProducts ?? [])}
              />
              <AvatarDropdown initials={initials} fullName={fullName} />
            </div>
            <div className="top-stack">
              <ProfileCompletionBanner score={user.profileScore} />
              {isAdmin ? <BillingStatusBanner /> : <BillingNoticeForTeammates />}
            </div>
            <div className="main-wrap">
              <section className="module active">{children}</section>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
