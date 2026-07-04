/**
 * Read-only ledger reconciliation report (diagnostic only — writes nothing).
 *
 * For every rehab project across all companies, compares:
 *   - Current "Total Spent" as budget/page.tsx computes it today:
 *       sum of Draw.amount where status is Paid or Approved
 *   - Invoice-based figures:
 *       Paid invoice total (proposed new "Total Spent" / Job-to-Date)
 *       All-status invoice total (proposed "Committed")
 *       Sum of InvoiceJobType.amount for Paid invoices (what
 *       lib/rehab/invoiceActuals.ts rolls into per-phase actuals today for
 *       unstaged Paid invoices)
 *   - The "$0 allocation" problem: invoices with amount > 0 whose job-type
 *     allocations sum to 0 (these contribute nothing to phase actuals).
 *
 * Run: npx tsx scripts/ledger-reconciliation.ts   (from apps/chg-rehab)
 */
import { prisma } from "../lib/prisma";
import { DrawStatus, InvoiceStatus } from "@prisma/client";

const fmt$ = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

async function main() {
  const projects = await prisma.project.findMany({
    include: {
      company: { select: { name: true } },
      draws: { select: { amount: true, status: true } },
      invoices: {
        select: {
          amount: true,
          status: true,
          jobTypes: { select: { amount: true } },
        },
      },
    },
    orderBy: [{ companyId: "asc" }, { code: "asc" }],
  });

  type Row = {
    company: string;
    code: string;
    name: string;
    drawSpent: number; // current "Total Spent" (Paid/Approved draws)
    drawCount: number; // count of Paid/Approved draws
    invPaid: number; // sum Invoice.amount, status = Paid
    invAll: number; // sum Invoice.amount, any status → proposed "Committed"
    jtPaid: number; // sum InvoiceJobType.amount for Paid invoices
    zeroAllocCount: number; // invoices with amount > 0 but jobType sum = 0
    zeroAllocTotal: number; // dollar total of those invoices
    proposedSpent: number; // proposed new "Total Spent" = Paid invoice total
  };

  const rows: Row[] = projects.map((p) => {
    // Exact replica of budget/page.tsx totalSpent (lines 68-70): Paid/Approved draws.
    const paidDraws = p.draws.filter(
      (d) => d.status === DrawStatus.Paid || d.status === DrawStatus.Approved
    );
    const drawSpent = paidDraws.reduce((acc, d) => acc + Number(d.amount), 0);

    const paidInvoices = p.invoices.filter((i) => i.status === InvoiceStatus.Paid);
    const invPaid = paidInvoices.reduce((acc, i) => acc + Number(i.amount), 0);
    const invAll = p.invoices.reduce((acc, i) => acc + Number(i.amount), 0);

    // What invoiceActuals.ts rolls into per-phase actuals for Paid invoices
    // (unstaged path: each InvoiceJobType.amount counts when invoice is Paid).
    const jtPaid = paidInvoices.reduce(
      (acc, i) => acc + i.jobTypes.reduce((s, jt) => s + Number(jt.amount), 0),
      0
    );

    // "$0 allocation" problem: invoice has a real amount but its job-type
    // allocations sum to zero (or it has none), so nothing hits phase actuals.
    const zeroAlloc = p.invoices.filter((i) => {
      const jtSum = i.jobTypes.reduce((s, jt) => s + Number(jt.amount), 0);
      return Number(i.amount) > 0 && jtSum === 0;
    });
    const zeroAllocTotal = zeroAlloc.reduce((acc, i) => acc + Number(i.amount), 0);

    return {
      company: p.company.name,
      code: p.code,
      name: p.name,
      drawSpent,
      drawCount: paidDraws.length,
      invPaid,
      invAll,
      jtPaid,
      zeroAllocCount: zeroAlloc.length,
      zeroAllocTotal,
      proposedSpent: invPaid,
    };
  });

  const headers = [
    "Company",
    "Project",
    "Cur Spent (draws P/A)",
    "#Draws",
    "Inv Paid total",
    "Inv All (Committed)",
    "JT sum (Paid inv)",
    "$0-alloc (n)",
    "$0-alloc ($)",
    "Proposed Spent (JTD)",
  ];

  const toCells = (r: Row) => [
    r.company,
    `${r.code} ${r.name}`,
    fmt$(r.drawSpent),
    String(r.drawCount),
    fmt$(r.invPaid),
    fmt$(r.invAll),
    fmt$(r.jtPaid),
    String(r.zeroAllocCount),
    fmt$(r.zeroAllocTotal),
    fmt$(r.proposedSpent),
  ];

  const total: Row = rows.reduce(
    (acc, r) => ({
      ...acc,
      drawSpent: acc.drawSpent + r.drawSpent,
      drawCount: acc.drawCount + r.drawCount,
      invPaid: acc.invPaid + r.invPaid,
      invAll: acc.invAll + r.invAll,
      jtPaid: acc.jtPaid + r.jtPaid,
      zeroAllocCount: acc.zeroAllocCount + r.zeroAllocCount,
      zeroAllocTotal: acc.zeroAllocTotal + r.zeroAllocTotal,
      proposedSpent: acc.proposedSpent + r.proposedSpent,
    }),
    {
      company: "",
      code: "PORTFOLIO",
      name: "TOTAL",
      drawSpent: 0,
      drawCount: 0,
      invPaid: 0,
      invAll: 0,
      jtPaid: 0,
      zeroAllocCount: 0,
      zeroAllocTotal: 0,
      proposedSpent: 0,
    }
  );

  const table = [headers, ...rows.map(toCells), toCells(total)];
  const widths = headers.map((_, c) => Math.max(...table.map((row) => row[c].length)));
  const line = (cells: string[]) =>
    cells.map((cell, c) => (c < 2 ? cell.padEnd(widths[c]) : cell.padStart(widths[c]))).join("  ");

  console.log(`Ledger reconciliation — ${rows.length} projects\n`);
  console.log(line(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(toCells(r)));
  console.log(widths.map((w) => "=".repeat(w)).join("  "));
  console.log(line(toCells(total)));

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
