"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/lib/session";
import NotificationBell from "./NotificationBell";
import BillingNavIndicator from "./BillingNavIndicator";
import BillingNavBadge from "./BillingNavBadge";
import AppSwitcher from "./AppSwitcher";
import WorkspaceNavLinks from "./WorkspaceNavLinks";

// Modules rendered before the WORKSPACE group.
const CORE_MODULES: { href: string; label: string }[] = [
  { href: "/pipeline", label: "Pipeline" },
  { href: "/underwriting", label: "Underwriting" },
  { href: "/rehab", label: "Rehab Manager" },
  { href: "/pm", label: "Project Manager" },
  { href: "/warehouse", label: "Warehouse" },
  { href: "/property", label: "Property Record" },
  { href: "/contacts", label: "Contacts" },
  { href: "/docs", label: "Documents Hub" },
  { href: "/contractor-portal", label: "Contractor Portal" },
  { href: "/investor-portal", label: "Investor Portal" },
];

export default function TopNav({
  user,
  companyName,
}: {
  user: SessionUser;
  companyName?: string | null;
}) {
  const pathname = usePathname();
  // Admin tab(s) render after the WORKSPACE group. Super Admin is only shown
  // to users with the platform-wide flag, appended after Admin Settings.
  const adminModules = user.isSuperAdmin
    ? [
        { href: "/admin", label: "Admin Settings" },
        { href: "/super-admin", label: "Super Admin" },
      ]
    : [{ href: "/admin", label: "Admin Settings" }];

  const initials =
    [(user.firstName || "")[0], (user.lastName || "")[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || (user.email || "U")[0].toUpperCase();

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "User";

  return (
    <header className="topbar">
      <div className="brand" title={companyName ?? undefined}>
        CHG <span>Rehab</span>
      </div>
      <nav className="module-nav">
        {CORE_MODULES.map((m) => {
          const active = pathname === m.href || pathname.startsWith(m.href + "/");
          return (
            <Link
              key={m.href}
              href={m.href}
              className={active ? "mnav-btn active" : "mnav-btn"}
            >
              {m.label}
            </Link>
          );
        })}
        <WorkspaceNavLinks />
        {adminModules.map((m) => {
          const active = pathname === m.href || pathname.startsWith(m.href + "/");
          return (
            <Link
              key={m.href}
              href={m.href}
              className={active ? "mnav-btn active" : "mnav-btn"}
            >
              {m.label}
            </Link>
          );
        })}
      </nav>
      <div className="topbar-right">
        {user.role === "Admin" ? <BillingNavIndicator /> : <BillingNavBadge />}
        <NotificationBell />
        <AppSwitcher
          currentProduct="chg"
          isInvestor={user.isInvestor ?? false}
          isContractor={user.isContractor ?? false}
        />
        <Link
          href="/account"
          className="user-pill"
          title={user.email ? `${user.email} — Account settings` : "Account settings"}
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div className="user-av">{initials}</div>
          <div>
            <div className="user-name">{fullName}</div>
            <div className="user-role">{user.role}</div>
          </div>
        </Link>
        <a
          href="/api/logout"
          className="mnav-btn"
          style={{ padding: "0 10px", height: 32, lineHeight: "32px", borderRadius: 4 }}
          title="Sign out"
        >
          Sign out
        </a>
      </div>
    </header>
  );
}
