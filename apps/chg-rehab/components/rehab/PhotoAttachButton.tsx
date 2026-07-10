"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadProjectDocument } from "@/lib/rehab/actions";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  MAX_UPLOAD_SIZE_LABEL,
} from "@/lib/fileValidation";

type PhaseOption = { id: string; number: number; name: string };

/**
 * Upload an image and attach it to the project as a Photo. The file is stored
 * through the shared `uploadProjectDocument` flow (Document, category "Photo"),
 * then a Photo row links it to whichever record this button was rendered on
 * (job type / daily log / issue / punch item) via `link`.
 */
export default function PhotoAttachButton({
  projectCode,
  link = {},
  phaseOptions,
  label = "+ Photo",
  className = "btn-sm",
}: {
  projectCode: string;
  link?: { phaseId?: string; dailyLogId?: string; issueId?: string; punchItemId?: string };
  /** When set (gallery use), lets the user tag the photo with a job type. */
  phaseOptions?: PhaseOption[];
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [phaseId, setPhaseId] = useState(link.phaseId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setCaption("");
    setPhaseId(link.phaseId ?? "");
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function submit() {
    setError(null);
    const file = fileRef.current?.files?.[0] ?? null;
    if (!file) {
      setError("Choose a photo to upload");
      return;
    }
    const mimeType = file.type || "application/octet-stream";
    if (!mimeType.startsWith("image/") || !ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
      setError("Please upload a JPG or PNG image.");
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setError(`File is too large. The maximum allowed size is ${MAX_UPLOAD_SIZE_LABEL}.`);
      return;
    }
    startTransition(async () => {
      try {
        const initRes = await fetch("/api/uploads/request-url", { method: "POST" });
        if (!initRes.ok) throw new Error(`Upload URL request failed (${initRes.status})`);
        const { uploadUrl, objectPath } = (await initRes.json()) as {
          uploadUrl: string;
          objectPath: string;
        };
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": mimeType },
          body: file,
        });
        if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);

        const doc = await uploadProjectDocument(projectCode, {
          name: caption.trim() || file.name,
          category: "Photo",
          fileKey: objectPath,
          mimeType,
          size: file.size,
        });

        const res = await fetch(`/api/rehab/${encodeURIComponent(projectCode)}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            docId: doc.id,
            caption: caption.trim() || null,
            phaseId: phaseId || link.phaseId || null,
            dailyLogId: link.dailyLogId ?? null,
            issueId: link.issueId ?? null,
            punchItemId: link.punchItemId ?? null,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);

        reset();
        setOpen(false);
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to attach photo");
      }
    });
  }

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button type="button" className={className} onClick={() => setOpen((v) => !v)}>
        {label}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            background: "#fff",
            border: "0.5px solid var(--border-mid)",
            borderRadius: 4,
            padding: 10,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            width: 260,
            zIndex: 60,
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 6 }}>Attach photo</div>
          <input
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            style={{ width: "100%", fontSize: 11, marginBottom: 6 }}
            disabled={pending}
          />
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption (optional)"
            disabled={pending}
            style={{ width: "100%", padding: "5px 8px", fontSize: 11, border: "0.5px solid var(--border-mid)", borderRadius: 3, marginBottom: 6 }}
          />
          {phaseOptions && phaseOptions.length > 0 && (
            <select
              value={phaseId}
              onChange={(e) => setPhaseId(e.target.value)}
              disabled={pending}
              style={{ width: "100%", padding: "5px 8px", fontSize: 11, border: "0.5px solid var(--border-mid)", borderRadius: 3, marginBottom: 6 }}
            >
              <option value="">No job type</option>
              {phaseOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  Job Type {p.number} — {p.name}
                </option>
              ))}
            </select>
          )}
          {error && <div style={{ fontSize: 10, color: "var(--red-txt)", marginBottom: 6 }}>{error}</div>}
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn-sm"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: "5px 12px", fontSize: 11 }}
              onClick={submit}
              disabled={pending}
            >
              {pending ? "Uploading..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
