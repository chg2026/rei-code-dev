import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { query } = await req.json().catch(() => ({ query: "" }));
  if (!query?.trim()) return NextResponse.json({ error: "Query required" }, { status: 400 });

  // Fetch a lightweight snapshot of the company's data for context
  const [propCount, dealCount, projectCount, contactCount] = await Promise.all([
    prisma.property.count({ where: { companyId: user.companyId } }),
    prisma.pipelineDeal.count({ where: { companyId: user.companyId } }),
    prisma.project.count({ where: { companyId: user.companyId } }),
    prisma.contact.count({ where: { companyId: user.companyId } }),
  ]);

  // Ask Claude to interpret the query
  const interpretation = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: `You are an AI assistant for a real estate company management platform called CHG Rehab. 
The platform manages: properties (${propCount} total), pipeline deals (${dealCount}), rehab projects (${projectCount}), contacts (${contactCount}).
Interpret the user's search query and return ONLY a JSON object with these fields:
- "answer": a 1-sentence natural language response to the query (be helpful and specific)
- "search_types": array of what to search, can include: "properties", "deals", "projects", "contacts", "tasks"
- "keyword": main keyword to search (string)
- "status_filter": status to filter by if mentioned (string or null)
Do not include markdown or explanation — only the raw JSON object.`,
    messages: [{ role: "user", content: query }],
  });

  let intent = { answer: "", search_types: ["properties", "deals", "projects", "contacts"], keyword: query, status_filter: null as string | null };
  try {
    const raw = interpretation.content[0].type === "text" ? interpretation.content[0].text : "{}";
    intent = { ...intent, ...JSON.parse(raw) };
  } catch { /* use defaults */ }

  const kw = intent.keyword || query;
  const statusFilter = intent.status_filter;

  // Run database queries based on Claude's interpretation
  const [properties, deals, projects, contacts] = await Promise.all([
    intent.search_types.includes("properties")
      ? prisma.property.findMany({
          where: {
            companyId: user.companyId,
            OR: [
              { address: { contains: kw, mode: "insensitive" } },
              { city: { contains: kw, mode: "insensitive" } },
              ...(statusFilter ? [{ status: { contains: statusFilter, mode: "insensitive" as const } }] : []),
            ],
          },
          select: { id: true, address: true, city: true, state: true, status: true },
          take: 6,
        })
      : Promise.resolve([]),
    intent.search_types.includes("deals")
      ? prisma.pipelineDeal.findMany({
          where: {
            companyId: user.companyId,
            address: { contains: kw, mode: "insensitive" },
          },
          select: { id: true, address: true, stage: true, code: true },
          take: 5,
        })
      : Promise.resolve([]),
    intent.search_types.includes("projects")
      ? prisma.project.findMany({
          where: {
            companyId: user.companyId,
            OR: [
              { name: { contains: kw, mode: "insensitive" } },
              { code: { contains: kw, mode: "insensitive" } },
              { property: { address: { contains: kw, mode: "insensitive" } } },
            ],
          },
          select: { id: true, name: true, code: true, status: true },
          take: 5,
        })
      : Promise.resolve([]),
    intent.search_types.includes("contacts")
      ? prisma.contact.findMany({
          where: {
            companyId: user.companyId,
            OR: [
              { name: { contains: kw, mode: "insensitive" } },
              { email: { contains: kw, mode: "insensitive" } },
              { trade: { contains: kw, mode: "insensitive" } },
            ],
          },
          select: { id: true, name: true, email: true, type: true },
          take: 5,
        })
      : Promise.resolve([]),
  ]);

  // Contact has no `role` field; expose `type` (ContactType) as `role` to match the client contract.
  const contactsOut = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    role: c.type as string,
  }));

  return NextResponse.json({
    answer: intent.answer,
    query,
    results: { properties, deals, projects, contacts: contactsOut },
    total: properties.length + deals.length + projects.length + contactsOut.length,
  });
}
