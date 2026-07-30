"use client";

import Link from "next/link";

const TABS: { value: string; label: string }[] = [
  { value: "account", label: "Account" },
  { value: "investors", label: "Investors" },
  { value: "deals", label: "Deals" },
  { value: "fundraising", label: "Fundraising" },
  { value: "finance", label: "Finance" },
  { value: "departments", label: "Departments" },
  { value: "permissions", label: "Permissions" },
];

export default function AdminTabStrip({
  current,
}: {
  current: string;
}) {
  return (
    <nav className="admin-top-tabs" aria-label="Admin sections">
      {TABS.map((t) => {
        const active = (t.value === "account" && (!current || current === "account")) ||
          current === t.value;
        return (
          <Link
            key={t.value}
            href={t.value === "account" ? "/admin" : `/admin?tab=${t.value}`}
            className={`admin-top-tab${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
