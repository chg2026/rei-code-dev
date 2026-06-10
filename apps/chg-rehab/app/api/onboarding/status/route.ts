import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [propCount, dealCount, projectCount, analysisCount, userCount, company] = await Promise.all([
    prisma.property.count({ where: { companyId: user.companyId } }),
    prisma.pipelineDeal.count({ where: { companyId: user.companyId } }),
    prisma.project.count({ where: { companyId: user.companyId } }),
    prisma.propertyFinancialSection.count({ where: { property: { companyId: user.companyId }, section: { startsWith: "underwriting_" } } }),
    prisma.user.count({ where: { companyId: user.companyId } }),
    prisma.company.findUnique({ where: { id: user.companyId }, select: { name: true } }),
  ]);

  const companyNameSet = !!(company?.name && company.name !== "My Company" && company.name.length > 2);

  return NextResponse.json({
    steps: [
      { id: "company", label: "Set up your company", desc: "Add your company name in Admin Settings", done: companyNameSet, href: "/admin" },
      { id: "property", label: "Add your first property", desc: "Add a property to your portfolio", done: propCount > 0, href: "/property" },
      { id: "deal", label: "Add a pipeline deal", desc: "Track an acquisition in progress", done: dealCount > 0, href: "/pipeline?new=1" },
      { id: "analysis", label: "Run an underwriting analysis", desc: "Analyze a deal with Flip, BRRRR, or MAO", done: analysisCount > 0, href: "/underwriting" },
      { id: "rehab", label: "Start a rehab project", desc: "Set up your first construction project", done: projectCount > 0, href: "/rehab" },
      { id: "team", label: "Invite a team member", desc: "Add your first teammate to the platform", done: userCount > 1, href: "/settings/team" },
    ],
  });
}
