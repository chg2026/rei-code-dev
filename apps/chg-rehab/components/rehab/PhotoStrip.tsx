"use client";

export type StripPhoto = {
  id: string;
  docId: string | null;
  caption: string | null;
};

/** Row of photo thumbnails; each opens the full image in a new tab. */
export default function PhotoStrip({ photos, size = 56 }: { photos: StripPhoto[]; size?: number }) {
  const withDocs = photos.filter((p) => p.docId);
  if (withDocs.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
      {withDocs.map((p) => (
        <a
          key={p.id}
          href={`/api/documents/${p.docId}/download`}
          target="_blank"
          rel="noreferrer"
          title={p.caption ?? "Photo"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/documents/${p.docId}/download`}
            alt={p.caption ?? "Photo"}
            style={{
              height: size,
              width: size,
              objectFit: "cover",
              borderRadius: 4,
              border: "0.5px solid var(--border-mid)",
              display: "block",
            }}
          />
        </a>
      ))}
    </div>
  );
}
