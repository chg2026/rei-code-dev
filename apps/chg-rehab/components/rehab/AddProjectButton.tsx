"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import type { Property } from "./AddProjectModal";

const AddProjectModal = dynamic(() => import("./AddProjectModal"), { ssr: false });

export default function AddProjectButton({
  initialProperty = null,
  label = "+ New project",
}: {
  initialProperty?: Property | null;
  label?: string;
} = {}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-sm" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <AddProjectModal onClose={() => setOpen(false)} initialProperty={initialProperty} />
      )}
    </>
  );
}
