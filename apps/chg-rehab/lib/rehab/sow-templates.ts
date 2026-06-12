/**
 * Pre-built Scope-of-Work templates. Applied from the SOW tab via
 * `POST /api/rehab/[projectId]/sow/apply-template` to bootstrap a project's
 * phases. `dependencies` reference other phases by their 1-based template
 * position (the same value used as the created phase `number`).
 */

export type SowTemplatePhase = {
  name: string;
  laborBudget?: number;
  materialsBudget?: number;
  dependencies: number[];
  acceptanceCriteria: string[];
};

export type SowTemplateKey = "full_gut" | "turnover";

export type SowTemplate = {
  key: SowTemplateKey;
  label: string;
  description: string;
  phases: SowTemplatePhase[];
};

export const FULL_GUT_REHAB: SowTemplate = {
  key: "full_gut",
  label: "Full Gut Rehab",
  description: "16-phase deep renovation from demo through rent-ready.",
  phases: [
    { name: "Demo", laborBudget: 0, materialsBudget: 0, dependencies: [], acceptanceCriteria: ["All debris removed", "Dumpster ordered"] },
    { name: "Framing", dependencies: [1], acceptanceCriteria: ["All walls framed", "Inspection passed"] },
    { name: "Electrical", dependencies: [2], acceptanceCriteria: ["All outlets installed", "GFCIs installed", "Fixtures installed", "Panel labeled", "Inspection passed"] },
    { name: "Plumbing", dependencies: [2], acceptanceCriteria: ["Rough-in complete", "Pressure test passed", "Inspection passed"] },
    { name: "HVAC", dependencies: [2], acceptanceCriteria: ["Ducts installed", "Unit installed", "Inspection passed"] },
    { name: "Insulation", dependencies: [3, 4, 5], acceptanceCriteria: ["All cavities insulated", "Inspection passed"] },
    { name: "Drywall", dependencies: [6], acceptanceCriteria: ["Hung", "Mudded", "Sanded", "Ready for paint"] },
    { name: "Paint", dependencies: [7], acceptanceCriteria: ["Prime coat done", "Two finish coats done", "Touch-ups complete"] },
    { name: "Flooring", dependencies: [8], acceptanceCriteria: ["Subfloor prepped", "Flooring installed", "Transitions installed"] },
    { name: "Kitchen", dependencies: [8], acceptanceCriteria: ["Cabinets installed", "Countertops installed", "Appliances installed"] },
    { name: "Bathroom", dependencies: [8], acceptanceCriteria: ["Tile complete", "Fixtures installed", "Vanity installed"] },
    { name: "Doors", dependencies: [8], acceptanceCriteria: ["All doors hung", "Hardware installed"] },
    { name: "Trim", dependencies: [8], acceptanceCriteria: ["Baseboards installed", "Casing installed", "Painted"] },
    { name: "Exterior", dependencies: [], acceptanceCriteria: ["Siding/paint done", "Landscaping done"] },
    { name: "Punch List", dependencies: [9, 10, 11, 12, 13], acceptanceCriteria: ["All punch items addressed", "PM walkthrough complete"] },
    { name: "Rent Ready", dependencies: [15], acceptanceCriteria: ["Deep clean done", "Keys ready", "Utilities on"] },
  ],
};

export const TURNOVER_REHAB: SowTemplate = {
  key: "turnover",
  label: "Turnover Rehab",
  description: "5-phase light turn between tenants.",
  phases: [
    { name: "Paint", dependencies: [], acceptanceCriteria: ["All rooms painted", "Touch-ups done"] },
    { name: "Flooring", dependencies: [1], acceptanceCriteria: ["Cleaned or replaced", "Transitions done"] },
    { name: "Cleaning", dependencies: [1, 2], acceptanceCriteria: ["Deep clean complete", "Appliances cleaned"] },
    { name: "Repairs", dependencies: [], acceptanceCriteria: ["All work orders addressed"] },
    { name: "Rent Ready", dependencies: [1, 2, 3, 4], acceptanceCriteria: ["PM walkthrough done", "Keys ready"] },
  ],
};

export const SOW_TEMPLATES: Record<SowTemplateKey, SowTemplate> = {
  full_gut: FULL_GUT_REHAB,
  turnover: TURNOVER_REHAB,
};
