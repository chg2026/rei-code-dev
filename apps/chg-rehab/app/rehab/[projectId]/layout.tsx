import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import ProjectBar from "@/components/rehab/ProjectBar";
import TabNav from "@/components/rehab/TabNav";
import { getCurrentUser } from "@/lib/auth";
import { loadProjectByCode } from "@/lib/rehab/queries";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function RehabProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    console.log("[auth:diag] rehab/[projectId]/layout | getCurrentUser()=null | action=redirect_login | reason=no_session_or_no_profile_row");
    redirect("/login");
  }
  const { projectId } = await params;
  const code = decodeURIComponent(projectId);
  const project = await loadProjectByCode(user.companyId, code);
  if (!project) notFound();
  const allProjects = await prisma.project.findMany({
    where: { companyId: user.companyId },
    include: {
      property: { select: { address: true, code: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 60,
  });
  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* LEFT: persistent project list */}
      <div style={{
        width: 240, flexShrink: 0,
        borderRight: "0.5px solid var(--border-lo)",
        display: "flex", flexDirection: "column", overflow: "hidden",
        background: "var(--bg-secondary)",
      }}>
        <div style={{ padding: "8px 10px", borderBottom: "0.5px solid var(--border-lo)", fontSize: 10, color: "var(--text-tertiary)", fontWeight: 500 }}>
          {allProjects.length} project{allProjects.length !== 1 ? "s" : ""}
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {allProjects.map((proj) => {
            const isActive = proj.code === project.code;
            return (
              <Link
                key={proj.id}
                href={`/rehab/${encodeURIComponent(proj.code)}/overview`}
                style={{
                  display: "flex", flexDirection: "column", gap: 3,
                  padding: "9px 10px",
                  borderBottom: "0.5px solid var(--border-lo)",
                  textDecoration: "none", color: "inherit",
                  background: isActive ? "var(--bg-primary)" : "transparent",
                  borderLeft: isActive ? "2px solid var(--marine)" : "2px solid transparent",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: isActive ? 600 : 500, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {proj.property.address.split(",")[0]}
                </div>
                <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                  {proj.property.code}
                </div>
              </Link>
            );
          })}
          {allProjects.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", fontSize: 11, color: "var(--text-tertiary)" }}>
              No projects yet.
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: project detail */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <ProjectBar project={project} />
        <TabNav projectCode={project.code} />
        {children}
      </div>
    </div>
  );
}
