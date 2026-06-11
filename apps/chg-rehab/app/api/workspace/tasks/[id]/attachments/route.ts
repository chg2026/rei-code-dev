import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getPrivateFile } from "@/lib/objectStorage";

export const dynamic = "force-dynamic";

// Object paths are minted by POST /api/uploads/request-url as `uploads/<uuid>`.
// Reject anything else so a client can't register (and later get a signed URL
// for) an arbitrary object outside the uploads namespace.
const UPLOAD_PATH_RE = /^uploads\/[0-9a-fA-F-]{36}$/;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const task = await prisma.wsTask.findFirst({
    where: { id, companyId: user.companyId },
    select: { id: true },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await prisma.wsTaskAttachment.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "asc" },
  });
  const attachments = await Promise.all(
    rows.map(async (r) => {
      let url = "";
      try {
        const f = await getPrivateFile(r.objectPath);
        url = f.signedUrl;
      } catch {
        url = "";
      }
      return { id: r.id, name: r.name, mimeType: r.mimeType, size: r.size, createdAt: r.createdAt.toISOString(), url };
    })
  );
  return NextResponse.json({ attachments });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const task = await prisma.wsTask.findFirst({
    where: { id, companyId: user.companyId },
    select: { id: true },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    objectPath?: string;
    name?: string;
    mimeType?: string;
    size?: number;
  };
  if (!body.objectPath || !body.name) {
    return NextResponse.json({ error: "objectPath and name are required" }, { status: 400 });
  }
  if (!UPLOAD_PATH_RE.test(body.objectPath)) {
    return NextResponse.json({ error: "Invalid objectPath" }, { status: 400 });
  }

  const att = await prisma.wsTaskAttachment.create({
    data: {
      taskId: id,
      uploadedById: user.id,
      objectPath: body.objectPath,
      name: body.name,
      mimeType: body.mimeType ?? "application/octet-stream",
      size: typeof body.size === "number" ? body.size : 0,
    },
  });
  return NextResponse.json({
    attachment: { id: att.id, name: att.name, mimeType: att.mimeType, size: att.size, createdAt: att.createdAt.toISOString() },
  });
}
