"use client";

import { useRef } from "react";

export default function FileUploadButton({
  label,
  accept = "*",
  multiple = true,
  className = "btn btn-p btn-sm",
}: {
  label: string;
  accept?: string;
  multiple?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.click()}>
        {label}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: "none" }}
        onChange={(e) => {
          const files = e.target.files;
          if (!files || files.length === 0) return;
          const names = Array.from(files).map((f) => f.name).join(", ");
          alert(`Selected: ${names}\n\n(Upload functionality coming soon — files will be stored when backend is connected.)`);
          e.target.value = "";
        }}
      />
    </>
  );
}
