/**
 * A loggable description of an error. Drizzle's query errors embed the SQL parameters
 * (phone numbers, IPs) in `message`, so for those only the driver's own error is used.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown error";
  if (error.cause instanceof Error) return error.cause.message;
  if (error.message.startsWith("Failed query:")) return "Database query failed";
  return error.message;
}

/** +919876543210 -> +91******3210 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 6) return "*".repeat(digits.length);
  const country = phone.startsWith("+91") ? "+91" : phone.startsWith("+") ? "+" : "";
  const rest = digits.slice(country.length > 1 ? country.length - 1 : 0);
  return `${country}${"*".repeat(rest.length - 4)}${rest.slice(-4)}`;
}
