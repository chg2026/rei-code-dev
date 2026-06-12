import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPrivateFile } from "@/lib/objectStorage";

export const dynamic = "force-dynamic";

// Object paths are minted server-side by getUploadUrl() as `uploads/<uuid>`.
// Only accept that exact shape on register so a caller can't register (and
// later sign) some other tenant's object path.
const MINTED_OBJECT_PATH =
  /^uploads\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Resolve an invoice scoped to the user's company + the route project. */
async function resolveInvoice(
  projectIdOrCode: string,
  invoiceId: string,
  companyId: string
) {
  const project = await prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true },
  });
  if (!project) return null;
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, projectId: project.id },
    select: { id: true },
  });
  return invoice ? invoice.id : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; invoiceId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId, invoiceId } = await params;
  const id = await resolveInvoice(decodeURIComponent(projectId), invoiceId, user.companyId);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await prisma.invoiceAttachment.findMany({
    where: { invoiceId: id },
    orderBy: { createdAt: "asc" },
  });

  const attachments = await Promise.all(
    rows.map(async (a) => {
      let downloadUrl: string | null = null;
      try {
        const file = await getPrivateFile(a.objectPath);
        downloadUrl = file.signedUrl;
      } catch {
        downloadUrl = null;
      }
      return {
        id: a.id,
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
        createdAt: a.createdAt,
        downloadUrl,
      };
    })
  );
  return NextResponse.json({ attachments });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; invoiceId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId, invoiceId } = await params;
  const id = await resolveInvoice(decodeURIComponent(projectId), invoiceId, user.companyId);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const objectPath = typeof body.objectPath === "string" ? body.objectPath.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!objectPath || !name) {
    return NextResponse.json({ error: "objectPath and name are required" }, { status: 400 });
  }
  if (!MINTED_OBJECT_PATH.test(objectPath)) {
    return NextResponse.json({ error: "Invalid objectPath" }, { status: 400 });
  }

  const attachment = await prisma.invoiceAttachment.create({
    data: {
      invoiceId: id,
      objectPath,
      name,
      mimeType:
        typeof body.mimeType === "string" && body.mimeType
          ? body.mimeType
          : "application/octet-stream",
      size: Number.isFinite(body.size) ? Math.max(0, Math.trunc(body.size)) : 0,
    },
  });
  return NextResponse.json({ attachment }, { status: 201 });
}
