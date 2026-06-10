"use client";

import React from "react";
import { useRouter } from "next/navigation";

interface PmSidebarProps {
  spaces: any[];
  selectedSpaceId?: string;
  selectedListId?: string;
}

const MARINE = "#1F4D5C";

export default function PmSidebar({ spaces, selectedSpaceId, selectedListId }: PmSidebarProps) {
  const router = useRouter();
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const [showCreateSpace, setShowCreateSpace] = React.useState(false);
  const [newSpaceName, setNewSpaceName] = React.useState("");
  const [newSpaceColor, setNewSpaceColor] = React.useState("#3B82F6");
  const [newListName, setNewListName] = React.useState<Record<string, string>>({});
  const [addingList, setAddingList] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#1F4D5C", "#6B7280"];

  const toggleCollapse = (spaceId: string) => {
    setCollapsed((p) => ({ ...p, [spaceId]: !p[spaceId] }));
  };

  const createSpace = async () => {
    if (!newSpaceName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/pm/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSpaceName.trim(), color: newSpaceColor }),
      });
      const data = await res.json();
      if (data.space) {
        setShowCreateSpace(false);
        setNewSpaceName("");
        router.push(`/pm/${data.space.id}`);
        router.refresh();
      }
    } finally {
      setCreating(false);
    }
  };

  const createList = async (spaceId: string) => {
    const name = newListName[spaceId]?.trim();
    if (!name) return;
    const res = await fetch(`/api/pm/spaces/${spaceId}/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (data.list) {
      setAddingList(null);
      setNewListName((p) => ({ ...p, [spaceId]: "" }));
      router.push(`/pm/${spaceId}/${data.list.id}`);
      router.refresh();
    }
  };

  return (
    <div
      style={{
        width: 220,
        minWidth: 220,
        background: "#FFFFFF",
        borderRight: "0.5px solid #E5E7EB",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 12px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "0.5px solid #E5E7EB",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: MARINE }}>Project Manager</span>
        <button
          onClick={() => setShowCreateSpace(true)}
          title="New space"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 18,
            color: "#6B7280",
            lineHeight: 1,
            padding: "0 2px",
          }}
        >
          +
        </button>
      </div>

      {/* Create space inline */}
      {showCreateSpace && (
        <div style={{ padding: "10px 12px", borderBottom: "0.5px solid #E5E7EB", background: "#F9FAFB" }}>
          <input
            autoFocus
            placeholder="Space name"
            value={newSpaceName}
            onChange={(e) => setNewSpaceName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createSpace(); if (e.key === "Escape") setShowCreateSpace(false); }}
            style={{ width: "100%", fontSize: 12, padding: "5px 8px", borderRadius: 4, border: "1px solid #D1D5DB", marginBottom: 8, boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewSpaceColor(c)}
                style={{
                  width: 18, height: 18, borderRadius: "50%", background: c, border: newSpaceColor === c ? "2px solid #111827" : "2px solid transparent", cursor: "pointer",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={createSpace}
              disabled={creating}
              style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: "5px 0", background: MARINE, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              onClick={() => setShowCreateSpace(false)}
              style={{ fontSize: 11, padding: "5px 8px", background: "none", border: "1px solid #D1D5DB", borderRadius: 4, cursor: "pointer", color: "#6B7280" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Spaces list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {spaces.map((space) => {
          const isOpen = !collapsed[space.id];
          return (
            <div key={space.id}>
              {/* Space header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  cursor: "pointer",
                  userSelect: "none",
                }}
                onClick={() => toggleCollapse(space.id)}
              >
                <span style={{ fontSize: 10, color: "#9CA3AF", width: 10 }}>{isOpen ? "▾" : "▸"}</span>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: space.color ?? "#3B82F6",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    fontSize: 12,
                    fontWeight: 600,
                    color: selectedSpaceId === space.id ? MARINE : "#374151",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {space.name}
                </span>
                <span style={{ fontSize: 10, color: "#9CA3AF" }}>{space.lists?.length ?? 0}</span>
              </div>

              {/* Lists */}
              {isOpen && (
                <div style={{ paddingBottom: 4 }}>
                  {(space.lists ?? []).map((list: any) => {
                    const isActive = selectedListId === list.id;
                    return (
                      <div
                        key={list.id}
                        onClick={() => router.push(`/pm/${space.id}/${list.id}`)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "5px 12px 5px 28px",
                          cursor: "pointer",
                          background: isActive ? "#EFF6FF" : "transparent",
                          borderRight: isActive ? `2px solid ${MARINE}` : "2px solid transparent",
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: list.color ?? "#9CA3AF",
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 12,
                            color: isActive ? MARINE : "#4B5563",
                            fontWeight: isActive ? 600 : 400,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {list.name}
                        </span>
                      </div>
                    );
                  })}

                  {/* Add list input */}
                  {addingList === space.id ? (
                    <div style={{ padding: "4px 12px 4px 28px" }}>
                      <input
                        autoFocus
                        placeholder="List name"
                        value={newListName[space.id] ?? ""}
                        onChange={(e) => setNewListName((p) => ({ ...p, [space.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") createList(space.id);
                          if (e.key === "Escape") setAddingList(null);
                        }}
                        onBlur={() => { if (!newListName[space.id]?.trim()) setAddingList(null); }}
                        style={{ width: "100%", fontSize: 11, padding: "4px 6px", borderRadius: 3, border: "1px solid #D1D5DB", boxSizing: "border-box" }}
                      />
                    </div>
                  ) : (
                    <div
                      onClick={(e) => { e.stopPropagation(); setAddingList(space.id); }}
                      style={{ padding: "4px 12px 4px 28px", fontSize: 11, color: "#9CA3AF", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <span>+</span> New List
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
