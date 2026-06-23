"use client";

import PmSidebar from "./PmSidebar";
import PmListView from "./PmListView";
import SpaceQuickTasks from "./SpaceQuickTasks";
import type { PmListLite, PmSpaceWithLists, PmStatus, PmTaskRow } from "./types";

export default function PmLayout({
  spaces,
  selectedSpaceId,
  selectedListId,
  tasks,
  statuses,
  quickTasksSpaceId,
  isAdmin = false,
}: {
  spaces: PmSpaceWithLists[];
  selectedSpaceId?: string;
  selectedListId?: string;
  tasks?: PmTaskRow[];
  statuses?: PmStatus[];
  lists?: PmListLite[];
  quickTasksSpaceId?: string;
  isAdmin?: boolean;
}) {
  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <PmSidebar spaces={spaces} selectedSpaceId={selectedSpaceId} selectedListId={selectedListId} isAdmin={isAdmin} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {selectedListId && statuses ? (
          <PmListView tasks={tasks ?? []} statuses={statuses} listId={selectedListId} spaceId={selectedSpaceId ?? ""} />
        ) : quickTasksSpaceId ? (
          <div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }}>
            <SpaceQuickTasks spaceId={quickTasksSpaceId} />
            <div style={{ maxWidth: 640, margin: "16px auto 0", width: "100%", padding: "0 24px", color: "var(--text-tertiary)", fontSize: 13, textAlign: "center" }}>
              Select a list from the sidebar to view its board, or create one.
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 14, textAlign: "center", padding: 24 }}>
            {selectedSpaceId ? "Select a list to view tasks, or create one from the sidebar." : "Select or create a space to get started."}
          </div>
        )}
      </div>
    </div>
  );
}
