export type PropertyLocation = {
  address: string;
  city: string | null;
  state: string | null;
};

function normalizedWords(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function containsWholeValue(address: string, value: string | null): boolean {
  if (!value) return true;
  const normalizedValue = normalizedWords(value);
  if (!normalizedValue) return true;
  return ` ${normalizedWords(address)} `.includes(` ${normalizedValue} `);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasTrailingState(address: string, state: string | null): boolean {
  if (!state) return true;
  const characters = Array.from(state.normalize("NFKC")).filter((character) => /[\p{L}\p{N}]/u.test(character));
  if (characters.length === 0) return true;
  const punctuatedState = characters.map(escapeRegExp).join("[\\s.]*");
  return new RegExp(
    `(?:^|[\\s,])${punctuatedState}[\\s.]*(?:\\d{5}(?:-\\d{4})?)?\\s*$`,
    "iu",
  ).test(address);
}

export function propertyTitle(property: PropertyLocation): string {
  const address = property.address.trim();
  const missingLocation: string[] = [];
  if (property.city && !containsWholeValue(address, property.city)) missingLocation.push(property.city);
  if (property.state && !hasTrailingState(address, property.state)) missingLocation.push(property.state);
  return missingLocation.length > 0 ? `${address}, ${missingLocation.join(", ")}` : address;
}
