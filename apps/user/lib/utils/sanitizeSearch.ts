/**
 * Strip characters that have special meaning inside PostgREST filter
 * strings (the value passed to `.or()`, `.filter()`, embedded resource
 * filters, etc.).
 *
 * PostgREST treats `,` as the operator/argument separator, `(` and `)`
 * as grouping for `or(...)` / `and(...)`, `.` as the column/operator
 * separator, and `:` as embedded-resource alias separator. When user
 * input is interpolated raw into an `.or(`...${search}...`)` template
 * a malicious value can append additional OR clauses that broaden the
 * resulting query, bypassing the surrounding AND scope. We therefore
 * remove every character that could break out of a single
 * `column.ilike.%value%` token.
 *
 * The result is safe to interpolate inside an `ilike` value, but it is
 * still bound by the rest of the query (the AND scope built from
 * `auth.agent.id`, RLS, etc.).
 */
export function sanitizePostgrestSearch(input: string | null | undefined): string {
  return String(input ?? "")
    .replace(/[,()&|:%.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
