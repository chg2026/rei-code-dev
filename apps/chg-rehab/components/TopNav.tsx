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
type PointerNavigationHandler = (event: React.MouseEvent<HTMLAnchorElement>) => void;

function PmNavTree({ pathname, isAdmin, iconOnly, onPointerNavigate }: {
  pathname: string;
  isAdmin: boolean;
  iconOnly: boolean;
  onPointerNavigate: PointerNavigationHandler;
}) {
  const [spaces, setSpaces] = useState<PmSpace[]>([]);
  const [openSpaces, setOpenSpaces] = useState<Set<string>>(new Set());

  // Load departments on mount so they render directly under the section header.
  useEffect(() => {
    fetch("/api/pm/spaces")
      .then((r) => r.json())
      .then((d) => setSpaces(d.spaces ?? []))
      .catch(() => {});
  }, []);

  // auto-open the space whose list is active
  useEffect(() => {
    if (!spaces.length) return;
    const active = spaces.find((s) =>
      s.lists.some((l) => pathname.startsWith(`/pm/${s.id}/${l.id}`))
    );
    if (active) {
      setOpenSpaces((prev) => new Set([...prev, active.id]));
    }
  }, [spaces, pathname]);

  // In collapsed/icon-only mode the tree is replaced by a single icon link.
  if (iconOnly) {
    const isPmActive = pathname.startsWith("/pm");
    return (
      <Link
        href="/pm"
        className={`nav-item${isPmActive ? " active" : ""}`}
        title="Company Departments"
        onClick={onPointerNavigate}
      >
        <LayoutGrid className="nav-icon" size={18} />
      </Link>
    );
  }

  return (
    <div className="pm-nav-tree pm-tree-spaces">
      {spaces.length === 0 && isAdmin && (
        <Link href="/pm" className="nav-item pm-tree-empty" onClick={onPointerNavigate}>
          + New Department
        </Link>
      )}
      {spaces.map((space) => {
        const spaceOpen = openSpaces.has(space.id);
        const spaceActive = pathname.startsWith(`/pm/${space.id}`);
        return (
          <div key={space.id}>
            <button
              className={`nav-item pm-space-row${spaceActive ? " active" : ""}`}
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
                      onClick={onPointerNavigate}
                    >
                      <span
                        className="pm-list-dot"
                        style={{ background: list.color ?? "#9ca3af" }}
                      />
                      {list.name}
                    </Link>
                  );
                })}
                <Link href={`/pm/${space.id}`} className="nav-item pm-list-item pm-add-list" onClick={onPointerNavigate}>
                  + New List
                </Link>
              </div>
            )}
          </div>
        );
      })}
      {spaces.length > 0 && (
        <Link href="/pm" className="nav-item pm-manage-link" onClick={onPointerNavigate}>
          Manage departments ›
        </Link>
      )}
    </div>
  );
}

const MIN_EXPANDED_WIDTH = 200;
const MAX_WIDTH = 340;
const DEFAULT_EXPANDED_WIDTH = 252;
const DESKTOP_RAIL_WIDTH = 76;
const MOBILE_RAIL_WIDTH = 64;

export default function TopNav({ user, companyName }: { user: SessionUser; companyName?: string | null }) {
  const pathname = usePathname();
  const isAdmin = user.role === "Admin";

  const [width, setWidth] = useState(DEFAULT_EXPANDED_WIDTH);
  const [expanded, setExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const asideRef = useRef<HTMLElement | null>(null);
  const draggingRef = useRef(false);
  const pointerInsideRef = useRef(false);

  // The desktop shell is an icon rail at rest. Hovering or keyboard focus
  // reveals the full navigation without changing the workspace width.
  useEffect(() => {
    setMounted(true);
    const stored = Number(localStorage.getItem("chg-sidebar-width"));
    if (stored >= MIN_EXPANDED_WIDTH && stored <= MAX_WIDTH) setWidth(stored);
    setIsMobile(window.innerWidth < 768);
  }, []);

  // Mobile stays compact until its dedicated navigation pattern is designed.
  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setExpanded(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const iconOnly = !expanded;
  const railWidth = isMobile ? MOBILE_RAIL_WIDTH : DESKTOP_RAIL_WIDTH;

  // The workspace always reserves the rail only. The expanded navigation
  // overlays it, so hovering never pushes boards, tables, or property panes.
  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${railWidth}px`);
  }, [railWidth]);

  // Persist.
  useEffect(() => {
    if (mounted) localStorage.setItem("chg-sidebar-width", String(width));
  }, [width, mounted]);
  // Drag-to-resize.
  const onHandleDown = useCallback((e: React.MouseEvent) => {
    if (!expanded) return;
    e.preventDefault();
    draggingRef.current = true;
    setDragging(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }, [expanded]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !asideRef.current) return;
      const left = asideRef.current.getBoundingClientRect().left;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_EXPANDED_WIDTH, e.clientX - left));
      setWidth(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (!pointerInsideRef.current && !asideRef.current?.contains(document.activeElement)) setExpanded(false);
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

  const onPointerNavigate: PointerNavigationHandler = (event) => {
    // Pointer clicks retain focus on the selected link. Collapse explicitly so
    // mouse navigation still returns to the icon rail once the route changes.
    if (!isMobile && event.detail > 0) setExpanded(false);
  };

  const brandLabel = companyName || "CHG";

  return (
    <aside
      ref={asideRef}
      className={`sidebar${iconOnly ? " collapsed" : ""}${dragging ? " dragging" : ""}`}
      style={expanded ? { width } : undefined}
      onMouseEnter={() => {
        pointerInsideRef.current = true;
        if (!isMobile) setExpanded(true);
      }}
      onMouseLeave={() => {
        pointerInsideRef.current = false;
        if (!isMobile && !dragging && !asideRef.current?.contains(document.activeElement)) setExpanded(false);
      }}
      onFocusCapture={() => {
        if (!isMobile) setExpanded(true);
      }}
      onBlurCapture={(event) => {
        if (!isMobile && !pointerInsideRef.current && !event.currentTarget.contains(event.relatedTarget)) setExpanded(false);
      }}
    >
      <div className="sidebar-head">
        <Link href="/" className="brand" title={brandLabel} onClick={onPointerNavigate}>
          <span className="brand-mark" style={{ fontSize: iconOnly ? 20 : (brandLabel.length > 12 ? 16 : 26) }}>
            {iconOnly ? brandLabel.charAt(0).toUpperCase() : brandLabel}
          </span>
          {!iconOnly ? <span className="brand-sub">Rehab Platform</span> : null}
        </Link>
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
              if (item.href === "/pm") return <PmNavTree key="/pm" pathname={pathname} isAdmin={isAdmin} iconOnly={iconOnly} onPointerNavigate={onPointerNavigate} />;
              const active = isActive(item.href);
              const Icon = ICONS[item.href];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "nav-item active" : "nav-item"}
                  title={iconOnly ? item.label : undefined}
                  onClick={onPointerNavigate}
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

      {expanded ? (
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
