"use client";

import PmSidebar from "./PmSidebar";
import PmListView from "./PmListView";
import type { PmListLite, PmSpaceWithLists, PmStatus, PmTaskRow } from "./types";

export default function PmLayout({
  spaces,
  selectedSpaceId,
  selectedListId,
  tasks,
  statuses,
}: {
  spaces: PmSpaceWithLists[];
  selectedSpaceId?: string;
  selectedListId?: string;
  tasks?: PmTaskRow[];
  statuses?: PmStatus[];
  lists?: PmListLite[];
}) {
  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <PmSidebar spaces={spaces} selectedSpaceId={selectedSpaceId} selectedListId={selectedListId} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {selectedListId && statuses ? (
          <PmListView tasks={tasks ?? []} statuses={statuses} listId={selectedListId} spaceId={selectedSpaceId ?? ""} />
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 14, textAlign: "center", padding: 24 }}>
            {selectedSpaceId ? "Select a list to view tasks, or create one from the sidebar." : "Select or create a space to get started."}
          </div>
        )}
      </div>
    </div>
  );
}
