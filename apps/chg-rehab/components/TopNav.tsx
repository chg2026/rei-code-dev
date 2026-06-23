"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  LayoutDashboard,
  ListChecks,
  CalendarDays,
  MessageSquare,
  Workflow,
  ClipboardCheck,
  Building2,
  Hammer,
  Warehouse as WarehouseIcon,
  DollarSign,
  FolderOpen,
  LayoutGrid,
  Target,
  Contact,
  HardHat,
  Briefcase,
  Users,
  CreditCard,
  Settings,
  ShieldCheck,
  UserCog,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import type { SessionUser } from "@/lib/session";
import WorkspaceNewPill from "@/components/WorkspaceNewPill";
import OnboardingChecklist from "@/components/OnboardingChecklist";

type NavItem = { href: string; label: string };
type NavSection = { label?: string; items: NavItem[] };

const DASHBOARD: NavItem = { href: "/dashboard", label: "Dashboard" };

const ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/workspace/tasks": ListChecks,
  "/workspace/calendar": CalendarDays,
  "/messages": MessageSquare,
  "/pipeline": Workflow,
  "/underwriting": ClipboardCheck,
  "/property": Building2,
  "/rehab": Hammer,
  "/warehouse": WarehouseIcon,
  "/investor-portal?tab=finance": DollarSign,
  "/docs": FolderOpen,
  "/pm": LayoutGrid,
  "/goals": Target,
  "/contacts": Contact,
  "/contractor-portal": HardHat,
  "/investor-portal": Briefcase,
  "/settings/team": Users,
  "/billing": CreditCard,
  "/admin": Settings,
  "/super-admin": ShieldCheck,
  "/account": UserCog,
};

const BASE_SECTIONS: NavSection[] = [
  { items: [DASHBOARD] },
  {
    label: "My Workspace",
    items: [
      { href: "/workspace/tasks", label: "My Tasks" },
      { href: "/workspace/calendar", label: "Calendar" },
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
      { href: "/investor-portal?tab=finance", label: "Finance" },
      { href: "/docs", label: "Documents Hub" },
    ],
  },
  {
    label: "Company Departments",
    items: [{ href: "/pm", label: "Company Departments" }],
  },
  {
    label: "Goals",
    items: [{ href: "/goals", label: "Goals" }],
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

type PmList = { id: string; name: string; color: string | null };
type PmSpace = { id: string; name: string; color: string | null; lists: PmList[] };

function PmNavTree({ pathname, isAdmin, iconOnly }: { pathname: string; isAdmin: boolean; iconOnly: boolean }) {
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

  // In collapsed/icon-only mode the tree is replaced by a single icon link.
  if (iconOnly) {
    return (
      <Link
        href="/pm"
        className={`nav-item${isPmActive ? " active" : ""}`}
        title="Company Departments"
      >
        <LayoutGrid className="nav-icon" size={18} />
      </Link>
    );
  }

  return (
    <div className="pm-nav-tree">
      <div className={`nav-item pm-tree-toggle${isPmActive ? " active" : ""}`} style={{ display: "flex", alignItems: "center", padding: 0 }}>
        <Link
          href="/pm"
          className="pm-tree-label"
          style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", color: "inherit", textDecoration: "none" }}
          onClick={() => setOpen(true)}
        >
          <LayoutGrid className="nav-icon" size={18} />
          Company Departments
        </Link>
        <button
          type="button"
          className="pm-tree-arrow-btn"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Toggle spaces"
          style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: "0 8px" }}
        >
          <span className={`pm-tree-arrow${open ? " open" : ""}`}>›</span>
        </button>
      </div>

      {open && (
        <div className="pm-tree-spaces">
          {spaces.length === 0 && isAdmin && (
            <Link href="/pm" className="nav-item pm-tree-empty">
              + New Department
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

const MIN_WIDTH = 60;
const MAX_WIDTH = 340;
const DEFAULT_WIDTH = 240;
const COLLAPSED_WIDTH = 64;

export default function TopNav({ user, companyName }: { user: SessionUser; companyName?: string | null }) {
  const pathname = usePathname();
  const isAdmin = user.role === "Admin";

  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const asideRef = useRef<HTMLElement | null>(null);
  const draggingRef = useRef(false);

  // Hydrate persisted state + mobile auto-collapse.
  useEffect(() => {
    setMounted(true);
    const stored = Number(localStorage.getItem("chg-sidebar-width"));
    if (stored >= MIN_WIDTH && stored <= MAX_WIDTH) setWidth(stored);
    const storedCollapsed = localStorage.getItem("chg-sidebar-collapsed");
    if (window.innerWidth < 768) setCollapsed(true);
    else if (storedCollapsed === "1") setCollapsed(true);
  }, []);

  // Auto-collapse on small viewports.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 768) setCollapsed(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const iconOnly = collapsed || width < 120;
  const effWidth = collapsed ? COLLAPSED_WIDTH : width;

  // Expose width to the layout so the main column margin tracks the sidebar.
  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${effWidth}px`);
  }, [effWidth]);

  // Persist.
  useEffect(() => {
    if (mounted) localStorage.setItem("chg-sidebar-width", String(width));
  }, [width, mounted]);
  useEffect(() => {
    if (mounted) localStorage.setItem("chg-sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed, mounted]);

  // Drag-to-resize.
  const onHandleDown = useCallback((e: React.MouseEvent) => {
    if (collapsed) return;
    e.preventDefault();
    draggingRef.current = true;
    setDragging(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }, [collapsed]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !asideRef.current) return;
      const left = asideRef.current.getBoundingClientRect().left;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX - left));
      setWidth(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

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

  const brandLabel = companyName || "CHG";

  return (
    <aside
      ref={asideRef}
      className={`sidebar${iconOnly ? " collapsed" : ""}${dragging ? " dragging" : ""}`}
      style={{ width: effWidth }}
    >
      <div className="sidebar-head">
        <Link href="/" className="brand" title={brandLabel}>
          <span className="brand-mark" style={{ fontSize: iconOnly ? 20 : (brandLabel.length > 12 ? 16 : 26) }}>
            {iconOnly ? brandLabel.charAt(0).toUpperCase() : brandLabel}
          </span>
          {!iconOnly ? <span className="brand-sub">Rehab Platform</span> : null}
        </Link>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <div className="sidebar-scroll">
        {sections.map((section, idx) => (
          <div className="nav-section" key={section.label ?? `section-${idx}`}>
            {section.label && !iconOnly ? (
              <div className="nav-label">
                {section.label}
                {section.label === "My Workspace" ? <WorkspaceNewPill /> : null}
              </div>
            ) : null}
            {section.items.map((item) => {
              if (item.href === "/pm") return <PmNavTree key="/pm" pathname={pathname} isAdmin={isAdmin} iconOnly={iconOnly} />;
              const active = isActive(item.href);
              const Icon = ICONS[item.href];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "nav-item active" : "nav-item"}
                  title={iconOnly ? item.label : undefined}
                >
                  {Icon ? <Icon className="nav-icon" size={18} /> : null}
                  {!iconOnly ? item.label : null}
                </Link>
              );
            })}
          </div>
        ))}
        {!iconOnly ? <OnboardingChecklist /> : null}
      </div>

      {!collapsed ? (
        <div
          className="sidebar-resize"
          onMouseDown={onHandleDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
        />
      ) : null}
    </aside>
  );
}
