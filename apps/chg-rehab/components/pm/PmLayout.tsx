"use client";

import React from "react";
import PmSidebar from "./PmSidebar";

interface PmLayoutProps {
  spaces: any[];
  selectedSpaceId?: string;
  selectedListId?: string;
  statuses?: any[];
  lists?: any[];
  children?: React.ReactNode;
}

export default function PmLayout({
  spaces,
  selectedSpaceId,
  selectedListId,
  statuses,
  lists,
  children,
}: PmLayoutProps) {
  return (
    <div style={{ display: "flex", height: "calc(100vh - 52px)", overflow: "hidden", background: "#F5F4F0" }}>
      <PmSidebar
        spaces={spaces}
        selectedSpaceId={selectedSpaceId}
        selectedListId={selectedListId}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}
