import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "./prisma";

/**
 * Default permission data for a company. This is the single source of truth
 * shared by the seed script (prisma/seed.ts) and the runtime provisioning
 * helper below, so a freshly-created company gets the same sensible defaults
 * that the prototype account was seeded with — instead of being
 * default-denied (which would lock ProjectManager/GC/etc. out of everything
 * until an admin hand-built the whole matrix).
 */

// ── Canonical feature list (used by the custom-role editor) ──────────────
export const PERMISSION_FEATURES: { key: string; label: string }[] = [
  { key: "pipeline", label: "Pipeline" },
  { key: "rehab", label: "Rehab projects" },
  { key: "property", label: "Properties" },
  { key: "contacts", label: "Contacts" },
  { key: "documents", label: "Documents" },
  { key: "warehouse", label: "Warehouse" },
  { key: "draws", label: "Draws" },
  { key: "checklist", label: "Checklist" },
  { key: "sow", label: "Scope of work (SOW)" },
  { key: "activity", label: "Activity log" },
  { key: "team", label: "Team management" },
  { key: "admin", label: "Admin settings" },
];

const VALID_LEVELS = new Set(["none", "view", "edit"]);
const FEATURE_KEYS = new Set(PERMISSION_FEATURES.map((f) => f.key));

/** Normalize an arbitrary permissions payload to feature → none/view/edit. */
export function normalizePermissions(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  for (const f of PERMISSION_FEATURES) {
    const v = src[f.key];
    out[f.key] = typeof v === "string" && VALID_LEVELS.has(v) ? v : "none";
  }
  // Preserve any extra known-valid keys (forward-compatible) without inventing new ones.
  for (const [k, v] of Object.entries(src)) {
    if (!FEATURE_KEYS.has(k) && typeof v === "string" && VALID_LEVELS.has(v)) {
      out[k] = v;
    }
  }
  return out;
}

// ── Legacy PermissionMatrixRow defaults (feature/action → role→bool) ─────
export const DEFAULT_PERMISSION_MATRIX: {
  feature: string;
  action: string;
  roles: Record<string, boolean>;
  notes?: string;
}[] = [
  { feature: "pipeline", action: "view", roles: { Admin: true, ProjectManager: true } },
  { feature: "pipeline", action: "edit", roles: { Admin: true, ProjectManager: true } },
  { feature: "pipeline", action: "approve", roles: { Admin: true } },
  { feature: "rehab", action: "view", roles: { Admin: true, ProjectManager: true, GeneralContractor: true, Subcontractor: true, Inspector: true } },
  { feature: "rehab", action: "edit", roles: { Admin: true, ProjectManager: true, GeneralContractor: true } },
  { feature: "rehab", action: "approve", roles: { Admin: true, ProjectManager: true } },
  { feature: "checklist", action: "edit", roles: { Admin: true, ProjectManager: true, GeneralContractor: true, Inspector: true }, notes: "Inspector + GC can verify checklist items" },
  { feature: "draws", action: "view", roles: { Admin: true, ProjectManager: true, GeneralContractor: true } },
  { feature: "draws", action: "edit", roles: { Admin: true, ProjectManager: true, GeneralContractor: true } },
  { feature: "draws", action: "approve", roles: { Admin: true, ProjectManager: true }, notes: "Draws require PM/Admin approval" },
  { feature: "warehouse", action: "view", roles: { Admin: true, ProjectManager: true, GeneralContractor: true, Subcontractor: true } },
  { feature: "warehouse", action: "edit", roles: { Admin: true, ProjectManager: true } },
  { feature: "property", action: "view", roles: { Admin: true, ProjectManager: true, GeneralContractor: true } },
  { feature: "property", action: "edit", roles: { Admin: true, ProjectManager: true } },
  { feature: "contacts", action: "view", roles: { Admin: true, ProjectManager: true, GeneralContractor: true } },
  { feature: "contacts", action: "edit", roles: { Admin: true, ProjectManager: true } },
  { feature: "contacts", action: "assign", roles: { Admin: true, ProjectManager: true }, notes: "Assign contractor to project" },
  { feature: "documents", action: "view", roles: { Admin: true, ProjectManager: true, GeneralContractor: true, Inspector: true } },
  { feature: "documents", action: "edit", roles: { Admin: true, ProjectManager: true } },
  { feature: "admin", action: "admin", roles: { Admin: true }, notes: "Admin Settings is Admin-only" },
];

// ── PermissionLabelRow defaults (the grid edited in /admin → Permissions) ─
export type PermLabelRow = {
  label: string;
  adminLock: boolean;
  pm: string;
  gc: string;
  sub: string;
  inspector: string;
  locked?: boolean;
};

export const DEFAULT_PERMISSION_LABEL_ROWS: PermLabelRow[] = [
  { label: "Approve draw payments", adminLock: false, pm: "edit", gc: "none", sub: "none", inspector: "none" },
  { label: "View projects", adminLock: false, pm: "view", gc: "view", sub: "view", inspector: "view" },
  { label: "Edit projects & SOW", adminLock: false, pm: "edit", gc: "none", sub: "none", inspector: "none" },
  { label: "Upload documents", adminLock: false, pm: "edit", gc: "edit", sub: "none", inspector: "none" },
  { label: "Delete documents", adminLock: true, pm: "none", gc: "none", sub: "none", inspector: "none" },
  { label: "View documents", adminLock: false, pm: "view", gc: "view", sub: "view", inspector: "view" },
  { label: "File exception", adminLock: false, pm: "edit", gc: "none", sub: "none", inspector: "none" },
  { label: "Verify checklist items", adminLock: false, pm: "edit", gc: "edit", sub: "none", inspector: "edit" },
  { label: "View checklist", adminLock: false, pm: "view", gc: "view", sub: "view", inspector: "view" },
  { label: "Add/edit SOW line items", adminLock: false, pm: "edit", gc: "none", sub: "none", inspector: "none" },
  { label: "Create document categories", adminLock: true, pm: "none", gc: "none", sub: "none", inspector: "none" },
  { label: "Manage warehouse templates", adminLock: true, pm: "edit", gc: "none", sub: "none", inspector: "none" },
  { label: "Add items to warehouse", adminLock: false, pm: "edit", gc: "edit", sub: "none", inspector: "none" },
  { label: "View warehouse", adminLock: false, pm: "view", gc: "view", sub: "none", inspector: "none" },
  { label: "View activity log", adminLock: false, pm: "view", gc: "view", sub: "view", inspector: "view" },
  { label: "Edit system log entries", adminLock: true, pm: "none", gc: "none", sub: "none", inspector: "none", locked: true },
  { label: "Change admin settings", adminLock: true, pm: "none", gc: "none", sub: "none", inspector: "none" },
  { label: "Add team members", adminLock: false, pm: "edit", gc: "none", sub: "none", inspector: "none" },
  // ── Rows for features that were previously only backed by the legacy
  // matrix. Defaults mirror DEFAULT_PERMISSION_MATRIX exactly so enabling the
  // FEATURE_ACTION_TO_LABEL mapping cannot change any existing user's access.
  { label: "View pipeline", adminLock: false, pm: "view", gc: "none", sub: "none", inspector: "none" },
  { label: "Edit pipeline", adminLock: false, pm: "edit", gc: "none", sub: "none", inspector: "none" },
  { label: "View rehab projects", adminLock: false, pm: "view", gc: "view", sub: "view", inspector: "view" },
  { label: "Edit rehab projects", adminLock: false, pm: "edit", gc: "edit", sub: "none", inspector: "none" },
  { label: "View properties", adminLock: false, pm: "view", gc: "view", sub: "none", inspector: "none" },
  { label: "Edit properties", adminLock: false, pm: "edit", gc: "none", sub: "none", inspector: "none" },
  { label: "View contacts", adminLock: false, pm: "view", gc: "view", sub: "none", inspector: "none" },
  { label: "Edit contacts", adminLock: false, pm: "edit", gc: "none", sub: "none", inspector: "none" },
];

// ── System role defaults (isSystem CompanyRole rows, for display/cloning) ─
type Level = "none" | "view" | "edit";
export const SYSTEM_ROLES: { key: string; name: string }[] = [
  { key: "Admin", name: "Admin" },
  { key: "ProjectManager", name: "Project Manager" },
  { key: "GeneralContractor", name: "General Contractor" },
  { key: "Subcontractor", name: "Subcontractor" },
  { key: "Inspector", name: "Inspector" },
];

const ALL_EDIT: Record<string, Level> = Object.fromEntries(
  PERMISSION_FEATURES.map((f) => [f.key, "edit" as Level])
);

export const DEFAULT_ROLE_PERMISSIONS: Record<string, Record<string, Level>> = {
  Admin: { ...ALL_EDIT },
  ProjectManager: {
    pipeline: "edit", rehab: "edit", property: "edit", contacts: "edit",
    documents: "edit", warehouse: "edit", draws: "edit", checklist: "edit",
    sow: "edit", activity: "view", team: "edit", admin: "none",
  },
  GeneralContractor: {
    pipeline: "none", rehab: "edit", property: "view", contacts: "view",
    documents: "edit", warehouse: "view", draws: "view", checklist: "edit",
    sow: "none", activity: "view", team: "none", admin: "none",
  },
  Subcontractor: {
    pipeline: "none", rehab: "view", property: "none", contacts: "none",
    documents: "view", warehouse: "view", draws: "none", checklist: "none",
    sow: "none", activity: "view", team: "none", admin: "none",
  },
  Inspector: {
    pipeline: "none", rehab: "view", property: "none", contacts: "none",
    documents: "view", warehouse: "none", draws: "none", checklist: "edit",
    sow: "none", activity: "view", team: "none", admin: "none",
  },
};

/**
 * Idempotently create the default permission rows (label grid + legacy matrix)
 * and the system CompanyRole rows for a company. Safe to call repeatedly — it
 * only fills in what's missing and never overwrites values an admin has
 * customized. Returns true when it created at least the label grid from
 * scratch (i.e. the company had no label rows before).
 */
export async function provisionCompanyPermissions(
  companyId: string,
  client: PrismaClient = defaultPrisma
): Promise<boolean> {
  const existingLabels = await client.permissionLabelRow.count({ where: { companyId } });
  const createdFresh = existingLabels === 0;

  if (createdFresh) {
    await client.$transaction(
      DEFAULT_PERMISSION_LABEL_ROWS.map((r, i) =>
        client.permissionLabelRow.upsert({
          where: { companyId_label: { companyId, label: r.label } },
          update: {},
          create: {
            companyId,
            label: r.label,
            ord: i,
            pm: r.pm,
            gc: r.gc,
            sub: r.sub,
            inspector: r.inspector,
            adminLock: r.adminLock,
            locked: !!r.locked,
          },
        })
      )
    );
  }

  const existingMatrix = await client.permissionMatrixRow.count({ where: { companyId } });
  if (existingMatrix === 0) {
    await client.$transaction(
      DEFAULT_PERMISSION_MATRIX.map((m) =>
        client.permissionMatrixRow.upsert({
          where: { companyId_feature_action: { companyId, feature: m.feature, action: m.action } },
          update: {},
          create: { companyId, feature: m.feature, action: m.action, roles: m.roles, notes: m.notes },
        })
      )
    );
  }

  // System CompanyRole rows (for display in the Permissions panel + cloning
  // into custom roles). Created if missing; existing rows left untouched.
  await client.$transaction(
    SYSTEM_ROLES.map((r) =>
      client.companyRole.upsert({
        where: { companyId_key: { companyId, key: r.key } },
        update: {},
        create: {
          companyId,
          key: r.key,
          name: r.name,
          isSystem: true,
          permissions: DEFAULT_ROLE_PERMISSIONS[r.key] ?? {},
        },
      })
    )
  );

  return createdFresh;
}
