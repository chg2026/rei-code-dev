import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

import TaskBoardView from "@/components/workspace/tasks/TaskBoardView";

describe("task board accessibility", () => {
  it("keeps the task opener separate from the nested status control", () => {
    render(
      <TaskBoardView
        tasks={[{
          id: "task-1",
          title: "Inspect foundation",
          priority: "Medium",
          status: "NotStarted",
          isPrivate: false,
          dueDate: null,
          done: false,
          linkLabel: null,
          space: { id: "space-1", name: "Construction", color: null },
          assignees: [],
          assignee: null,
          createdBy: null,
          createdAt: new Date().toISOString(),
        }]}
        spaces={[{ id: "space-1", name: "Construction", color: null }]}
        onOpen={vi.fn()}
        onStatusChange={vi.fn()}
        onMove={vi.fn()}
        onAddInSpace={vi.fn()}
      />,
    );

    const opener = screen.getByRole("button", { name: "Open task: Inspect foundation" });
    expect(opener.parentElement).not.toHaveAttribute("role", "button");
    expect(screen.getByRole("button", { name: /Not Started/ })).toBeInTheDocument();
  });
});