"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import type { SessionUser } from "@/lib/session";
import WorkspaceNewPill from "@/components/WorkspaceNewPill";
import OnboardingChecklist from "@/components/OnboardingChecklist";

type NavItem = { href: string; label: string };
type NavSection = { label?: string; items: NavItem[] };

const DASHBOARD: NavItem = { href: "/dashboard", label: "Dashboard" };

const BASE_SECTIONS: NavSection[] = [
  { items: [DASHBOARD] },
  {
    label: "My Workspace",
    items: [
      { href: "/command-center", label: "Tasks & Calendar" },
      { href: "/messages", label: "Messages" },
    ],
  },
  {
    label: "Deals",
    items: [
      { href: "/pipeline", label: "Pipeline" },
      { href: "/underwriting", label: "Underwriting" },
    ],
  },
  {
    label: "Portfolio",
    items: [
      { href: "/property", label: "Property Record" },
      { href: "/rehab", label: "Rehab Manager" },
      { href: "/warehouse", label: "Warehouse" },
      { href: "/finance", label: "Finance" },
      { href: "/pm", label: "Project Manager" },
      { href: "/docs", label: "Documents Hub" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/contacts", label: "Contacts" },
      { href: "/contractor-portal", label: "Contractor Portal" },
      { href: "/investor-portal", label: "Investor Portal" },
      { href: "/settings/team", label: "Team" },
    ],
  },
];

const DashboardIcon = () => (
  <svg
    className="nav-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

type PmList = { id: string; name: string; color: string | null };
type PmSpace = { id: string; name: string; color: string | null; lists: PmList[] };

function PmNavTree({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const [spaces, setSpaces] = useState<PmSpace[]>([]);
  const [openSpaces, setOpenSpaces] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    fetch("/api/pm/spaces")
      .then((r) => r.json())
      .then((d) => setSpaces(d.spaces ?? []));
  }, [open]);

  // auto-open the space whose list is active
  useEffect(() => {
    if (!spaces.length) return;
    const active = spaces.find((s) =>
      s.lists.some((l) => pathname.startsWith(`/pm/${s.id}/${l.id}`))
    );
    if (active) {
      setOpen(true);
      setOpenSpaces((prev) => new Set([...prev, active.id]));
    }
  }, [spaces, pathname]);

  const isPmActive = pathname.startsWith("/pm");

  return (
    <div className="pm-nav-tree">
      <button
        className={`nav-item pm-tree-toggle${isPmActive ? " active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="pm-tree-label">Project Manager</span>
        <span className={`pm-tree-arrow${open ? " open" : ""}`}>›</span>
      </button>

      {open && (
        <div className="pm-tree-spaces">
          {spaces.length === 0 && (
            <Link href="/pm" className="nav-item pm-tree-empty">
              + New Space
            </Link>
          )}
          {spaces.map((space) => {
            const spaceOpen = openSpaces.has(space.id);
            return (
              <div key={space.id}>
                <button
                  className="nav-item pm-space-row"
                  onClick={() =>
                    setOpenSpaces((prev) => {
                      const next = new Set(prev);
                      next.has(space.id) ? next.delete(space.id) : next.add(space.id);
                      return next;
                    })
                  }
                >
                  <span
                    className="pm-space-dot"
                    style={{ background: space.color ?? "#6366f1" }}
                  />
                  <span className="pm-space-name">{space.name}</span>
                  <span className={`pm-tree-arrow${spaceOpen ? " open" : ""}`}>›</span>
                </button>
                {spaceOpen && (
                  <div className="pm-space-lists">
                    {space.lists.map((list) => {
                      const href = `/pm/${space.id}/${list.id}`;
                      return (
                        <Link
                          key={list.id}
                          href={href}
                          className={`nav-item pm-list-item${pathname.startsWith(href) ? " active" : ""}`}
                        >
                          <span
                            className="pm-list-dot"
                            style={{ background: list.color ?? "#9ca3af" }}
                          />
                          {list.name}
                        </Link>
                      );
                    })}
                    <Link href={`/pm/${space.id}`} className="nav-item pm-list-item pm-add-list">
                      + New List
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
          <Link href="/pm" className="nav-item pm-manage-link">
            Manage spaces ›
          </Link>
        </div>
      )}
    </div>
  );
}

export default function TopNav({ user, companyName }: { user: SessionUser; companyName?: string | null }) {
  const pathname = usePathname();

  // Admin section is built per-render so the Super Admin tab can be
  // appended only for users with the platform-wide flag.
  const adminItems: NavItem[] = [
    { href: "/billing", label: "Billing" },
    { href: "/admin", label: "Admin Settings" },
  ];
  if (user.isSuperAdmin) {
    adminItems.push({ href: "/super-admin", label: "Super Admin" });
  }
  const sections: NavSection[] = [
    ...BASE_SECTIONS,
    { label: "Admin", items: adminItems },
    { label: "Account", items: [{ href: "/account", label: "Profile Settings" }] },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark" style={{ fontSize: companyName && companyName.length > 12 ? 16 : 26 }}>
            {companyName || "CHG"}
          </span>
          <span className="brand-sub">Rehab Platform</span>
        </Link>

        {sections.map((section, idx) => (
          <div className="nav-section" key={section.label ?? `section-${idx}`}>
            {section.label ? (
              <div className="nav-label">
                {section.label}
                {section.label === "My Workspace" ? <WorkspaceNewPill /> : null}
              </div>
            ) : null}
            {section.items.map((item) => {
              if (item.href === "/pm") return <PmNavTree key="/pm" pathname={pathname} />;
              const active = isActive(item.href);
              const isDashboard = item.href === DASHBOARD.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "nav-item active" : "nav-item"}
                >
                  {isDashboard ? <DashboardIcon /> : null}
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
        <OnboardingChecklist />
      </aside>
    </>
  );
}
