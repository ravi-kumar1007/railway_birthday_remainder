/** How the employee's name fills {{1}}: the settings page chooses (stored as name_format) */
export type NameFormat = "first" | "full";

export const DEFAULT_NAME_FORMAT: NameFormat = "first";

export function parseNameFormat(value: string | null | undefined): NameFormat {
  return value === "full" ? "full" : DEFAULT_NAME_FORMAT;
}

const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "shri", "sri", "smt", "kumari"]);

/** "Dr. Ananya Iyer" -> "Ananya" (first) or "Dr. Ananya Iyer" (full) */
export function nameForMessage(name: string, format: NameFormat): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (format === "full") return clean;
  const first = clean.split(" ").find((word) => !TITLES.has(word.toLowerCase().replace(/\.$/, "")));
  return first ?? clean;
}
