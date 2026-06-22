import type { TradeCategory } from "@prisma/client";

// Human-friendly labels for every TradeCategory enum value. Shared by the
// Add/Edit contact form, the Contractors "All trades" filter, and the contact
// detail page so the option list stays in lockstep with the Prisma enum.
export const TRADE_CATEGORY_OPTIONS: { value: TradeCategory; label: string }[] = [
  { value: "GeneralContractor", label: "General Contractor" },
  { value: "Plumbing", label: "Plumbing" },
  { value: "Electrical", label: "Electrical" },
  { value: "Roofing", label: "Roofing" },
  { value: "HVAC", label: "HVAC" },
  { value: "Framing", label: "Framing" },
  { value: "Drywall", label: "Drywall" },
  { value: "Flooring", label: "Flooring" },
  { value: "Painting", label: "Painting" },
  { value: "Concrete", label: "Concrete" },
  { value: "Masonry", label: "Masonry" },
  { value: "Landscaping", label: "Landscaping" },
  { value: "Demolition", label: "Demolition" },
  { value: "Waterproofing", label: "Waterproofing" },
  { value: "Insulation", label: "Insulation" },
  { value: "Windows", label: "Windows" },
  { value: "Doors", label: "Doors" },
  { value: "Cabinetry", label: "Cabinetry" },
  { value: "Tile", label: "Tile" },
  { value: "Foundation", label: "Foundation" },
  { value: "Excavation", label: "Excavation" },
  { value: "Fencing", label: "Fencing" },
  { value: "Cleaning", label: "Cleaning" },
  { value: "Inspector", label: "Inspector" },
  { value: "TitleCompany", label: "Title Company" },
  { value: "Lender", label: "Lender" },
  { value: "RealEstateAgent", label: "Real Estate Agent" },
  { value: "Attorney", label: "Attorney" },
  { value: "PropertyManagement", label: "Property Management" },
  { value: "Other", label: "Other" },
];

export const TRADE_CATEGORY_LABEL: Record<TradeCategory, string> =
  Object.fromEntries(
    TRADE_CATEGORY_OPTIONS.map((o) => [o.value, o.label])
  ) as Record<TradeCategory, string>;

const TRADE_CATEGORY_VALUES = TRADE_CATEGORY_OPTIONS.map((o) => o.value);

export function isTradeCategory(v: unknown): v is TradeCategory {
  return typeof v === "string" && TRADE_CATEGORY_VALUES.includes(v as TradeCategory);
}
