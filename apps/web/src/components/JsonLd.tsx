// Renders a schema.org JSON-LD block for search engines — real
// structured data (schema.org's `Movie`/`Event` types), not decoration.
// This is what lets a movie/event detail page show up as a rich result
// (poster, rating, showtimes) instead of a plain blue link.
//
// The `</` escape matters: an HTML parser looks for the literal bytes
// `</script` to end the tag regardless of JS string-escaping context, so
// a movie description that happens to contain that substring could
// otherwise truncate the tag early (a real markup bug, not just an
// XSS-hardening nicety — there's no untrusted script execution risk
// here either way, since this is static JSON text, not
// `dangerouslySetInnerHTML`).
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json">{JSON.stringify(data).replace(/<\//g, "<\\/")}</script>;
}
