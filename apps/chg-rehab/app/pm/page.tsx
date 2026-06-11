import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import PmNewSpaceButton from "@/components/pm/PmNewSpaceButton";

export const dynamic = "force-dynamic";

const BG = "#f9f8f6";
const INK = "#1a1a1a";
const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
};

function fmtDate(d: Date | null) {
  if (!d) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default async function PmPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [spacesRaw, myTasksRaw] = await Promise.all([
    prisma.pmSpace.findMany({
      where: { companyId: user.companyId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: {
        lists: {
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          select: { id: true, name: true, color: true, order: true, _count: { select: { tasks: true } } },
        },
        _count: { select: { lists: true } },
      },
    }),
    prisma.pmTask.findMany({
      where: {
        companyId: user.companyId,
        OR: [
          { createdById: user.id },
          { assignees: { some: { userId: user.id } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        status: { select: { name: true, color: true } },
        list: { select: { id: true, name: true, space: { select: { id: true, name: true, color: true } } } },
      },
    }),
  ]);

  const spaces = spacesRaw.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    listCount: s._count.lists,
    taskCount: s.lists.reduce((sum, l) => sum + l._count.tasks, 0),
    firstListId: s.lists[0]?.id ?? null,
  }));

  const myTasks = myTasksRaw.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    dueDate: fmtDate(t.dueDate),
    spaceId: t.list.space.id,
    spaceName: t.list.space.name,
    spaceColor: t.list.space.color,
    listId: t.list.id,
    listName: t.list.name,
  }));

  return (
    <div style={{ background: BG, minHeight: "100%", padding: "28px 32px", color: INK }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Project Manager</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b6b6b" }}>
            Spaces, lists, and the tasks you own across the company.
          </p>
        </div>
        <PmNewSpaceButton />
      </div>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#8a8a8a", margin: "0 0 12px" }}>
          Spaces
        </h2>
        {spaces.length === 0 ? (
          <div style={{ ...CARD, padding: 28, textAlign: "center", color: "#6b6b6b", fontSize: 14 }}>
            No spaces yet. Create your first space to start organizing work.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
            {spaces.map((s) => {
              const href = s.firstListId ? `/pm/${s.id}/${s.firstListId}` : `/pm/${s.id}`;
              return (
                <Link key={s.id} href={href} style={{ ...CARD, padding: 18, textDecoration: "none", color: INK, display: "block" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <span style={{ width: 12, height: 12, borderRadius: "50%", background: s.color ?? "#6366f1", flexShrink: 0 }} />
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{s.name}</span>
                  </div>
                  <div style={{ display: "flex", gap: 18, fontSize: 13, color: "#6b6b6b" }}>
                    <span>{s.listCount} {s.listCount === 1 ? "list" : "lists"}</span>
                    <span>{s.taskCount} {s.taskCount === 1 ? "task" : "tasks"}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#8a8a8a", margin: "0 0 12px" }}>
          My Tasks
        </h2>
        {myTasks.length === 0 ? (
          <div style={{ ...CARD, padding: 28, textAlign: "center", color: "#6b6b6b", fontSize: 14 }}>
            You have no tasks assigned to or created by you yet.
          </div>
        ) : (
          <div style={{ ...CARD, padding: 4 }}>
            {myTasks.map((t, i) => (
              <Link
                key={t.id}
                href={`/pm/${t.spaceId}/${t.listId}`}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                  textDecoration: "none", color: INK,
                  borderBottom: i < myTasks.length - 1 ? "1px solid #f0efec" : "none",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.spaceColor ?? "#6366f1", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: "#8a8a8a" }}>{t.spaceName} · {t.listName}</div>
                </div>
                {t.status && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
                    background: `${t.status.color}1a`, color: t.status.color,
                  }}>
                    {t.status.name}
                  </span>
                )}
                <span style={{ fontSize: 12, color: "#8a8a8a", width: 96, textAlign: "right", flexShrink: 0 }}>
                  {t.dueDate ?? "—"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
