/**
 * Server-side helper to write a private object directly (bypassing the
 * browser PUT flow). Used to persist generated artifacts like subscription
 * receipt PDFs, K-1 zips, etc. Returns the public-style `/objects/...`
 * path that downstream signing helpers (`getPrivateFile`, `getSignedDownloadUrl`)
 * already understand.
 */
import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "./supabaseServer";

const BUCKET = "chg-uploads";

/**
 * Write a buffer as a private object under `<subdir>/<uuid><ext>`.
 * Returns the canonical `/objects/<subdir>/<uuid><ext>` path.
 */
export async function putPrivateObject(
  buf: Buffer | Uint8Array,
  opts: { subdir: string; ext?: string; contentType?: string }
): Promise<string> {
  const id = randomUUID();
  const ext = opts.ext ? (opts.ext.startsWith(".") ? opts.ext : `.${opts.ext}`) : "";
  const sub = `${opts.subdir.replace(/^\/+|\/+$/g, "")}/${id}${ext}`;
  const fileBuffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage.from(BUCKET).upload(sub, fileBuffer, {
    contentType: opts.contentType || "application/octet-stream",
    upsert: true,
  });
  if (error) throw new Error(`Failed to upload object: ${error.message}`);
  return `/objects/${sub}`;
}
