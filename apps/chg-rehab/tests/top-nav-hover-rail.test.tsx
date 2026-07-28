import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/pipeline",
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/WorkspaceNewPill", () => ({ default: () => null }));
vi.mock("@/components/OnboardingChecklist", () => ({ default: () => null }));

import TopNav from "@/components/TopNav";

const user = {
  id: "user-1",
  role: "Admin",
  companyId: "company-1",
  accountProducts: ["chg"],
};

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

describe("TopNav hover rail", () => {
  beforeEach(() => {
    localStorage.clear();
    setViewport(1440);
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  });

  it("starts as an icon rail, expands on hover, and keeps the workspace rail width stable", () => {
    render(<TopNav user={user} companyName="CHG" />);

    const sidebar = document.querySelector("aside.sidebar");
    expect(sidebar).not.toBeNull();
    expect(sidebar).toHaveClass("collapsed");
    expect((sidebar as HTMLElement).style.width).toBe("");
    expect(document.documentElement.style.getPropertyValue("--sidebar-width")).toBe("76px");

    fireEvent.mouseEnter(sidebar!);

    expect(sidebar).not.toHaveClass("collapsed");
    expect(sidebar).toHaveStyle({ width: "252px" });
    expect(screen.getByText("Rehab Platform")).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue("--sidebar-width")).toBe("76px");

    fireEvent.mouseLeave(sidebar!);

    expect(sidebar).toHaveClass("collapsed");
    expect((sidebar as HTMLElement).style.width).toBe("");
  });

  it("keeps the rail open when focus leaves while the pointer remains inside", () => {
    render(<TopNav user={user} companyName="CHG" />);

    const sidebar = document.querySelector("aside.sidebar");
    const dashboard = screen.getByTitle("Dashboard");
    expect(sidebar).not.toBeNull();

    fireEvent.mouseEnter(sidebar!);
    fireEvent.focus(dashboard);
    fireEvent.blur(dashboard, { relatedTarget: document.body });

    expect(sidebar).not.toHaveClass("collapsed");

    fireEvent.mouseLeave(sidebar!);
    expect(sidebar).toHaveClass("collapsed");
  });

  it("collapses after a resize drag ends outside the rail", () => {
    render(<TopNav user={user} companyName="CHG" />);

    const sidebar = document.querySelector("aside.sidebar");
    expect(sidebar).not.toBeNull();

    fireEvent.mouseEnter(sidebar!);
    const resizeHandle = document.querySelector(".sidebar-resize");
    expect(resizeHandle).not.toBeNull();

    fireEvent.mouseDown(resizeHandle!);
    fireEvent.mouseLeave(sidebar!);
    fireEvent.mouseUp(window);

    expect(sidebar).toHaveClass("collapsed");
  });

  it("opens for keyboard focus and preserves the 64px mobile rail", () => {
    const { unmount } = render(<TopNav user={user} companyName="CHG" />);
    const sidebar = document.querySelector("aside.sidebar");
    expect(sidebar).not.toBeNull();

    fireEvent.focus(screen.getByTitle("Dashboard"));
    expect(sidebar).not.toHaveClass("collapsed");

    unmount();
    setViewport(375);
    render(<TopNav user={user} companyName="CHG" />);

    const mobileSidebar = document.querySelector("aside.sidebar");
    expect(mobileSidebar).not.toBeNull();
    fireEvent.mouseEnter(mobileSidebar!);
    expect(mobileSidebar).toHaveClass("collapsed");
    expect((mobileSidebar as HTMLElement).style.width).toBe("");
    expect(document.documentElement.style.getPropertyValue("--sidebar-width")).toBe("64px");
  });
});
