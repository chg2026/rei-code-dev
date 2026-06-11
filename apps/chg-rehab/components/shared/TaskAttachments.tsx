"use client";
import { useEffect, useRef, useState } from "react";

interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
}

export default function TaskAttachments({ taskId, apiBase }: { taskId: string; apiBase: string }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () =>
    fetch(`${apiBase}/${taskId}/attachments`)
      .then((r) => (r.ok ? r.json() : { attachments: [] }))
      .then((d) => setAttachments(d.attachments ?? []))
      .catch(() => setAttachments([]));

  useEffect(() => {
    if (taskId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !taskId) return;
    setUploading(true);
    try {
      // 1. Get a signed upload URL from the shared uploads endpoint.
      const { uploadUrl, objectPath } = await fetch("/api/uploads/request-url", {
        method: "POST",
      }).then((r) => r.json());
      // 2. Upload the file bytes directly to storage.
      await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      // 3. Register the attachment against the task.
      await fetch(`${apiBase}/${taskId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectPath,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        }),
      });
      await load();
    } catch (err) {
      console.error("[TaskAttachments] upload failed", err);
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = async (id: string) => {
    await fetch(`${apiBase}/${taskId}/attachments/${id}`, { method: "DELETE" });
    setAttachments((a) => a.filter((x) => x.id !== id));
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#6b7280",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        Attachments
      </div>
      {attachments.map((a) => (
        <div
          key={a.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 0",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <span style={{ fontSize: 18 }}>
            {a.mimeType?.startsWith("image/") ? "🖼️" : a.mimeType === "application/pdf" ? "📄" : "📎"}
          </span>
          <a
            href={a.url || undefined}
            target="_blank"
            rel="noreferrer"
            style={{ flex: 1, fontSize: 13, color: "#1a1a1a", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {a.name}
          </a>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>{(a.size / 1024).toFixed(0)} KB</span>
          <button
            type="button"
            onClick={() => remove(a.id)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 16 }}
            title="Remove attachment"
          >
            ×
          </button>
        </div>
      ))}
      {attachments.length === 0 && (
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>No attachments yet.</div>
      )}
      <input ref={inputRef} type="file" style={{ display: "none" }} onChange={handleFile} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        style={{
          marginTop: 6,
          fontSize: 12,
          color: "#6366f1",
          background: "none",
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          padding: "4px 10px",
          cursor: uploading ? "default" : "pointer",
        }}
      >
        {uploading ? "Uploading…" : "+ Attach file"}
      </button>
    </div>
  );
}
