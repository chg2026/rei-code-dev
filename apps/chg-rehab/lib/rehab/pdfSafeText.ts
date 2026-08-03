/**
 * Make any string safe for pdf-lib's StandardFont (Helvetica), whose WinAnsi
 * (CP1252) encoding THROWS on characters it can't encode — emoji, the true
 * minus sign (U+2212), arrows, non-Latin scripts, etc. An unsanitised draw
 * would crash the whole generator, the API route would 500, and the browser
 * would save the error page as a .pdf ("corrupted, won't open").
 *
 * We map the common typographic look-alikes to ASCII, then drop anything still
 * outside the WinAnsi-safe Latin-1 range so a draw can NEVER throw, whatever
 * the input. Shared by every CHG pdf-lib report generator so they can't drift.
 */
export function pdfText(input: unknown): string {
  let s = String(input ?? "");
  const map: Record<string, string> = {
    "\u2212": "-", // minus sign → hyphen
    "\u2013": "-", // en dash
    "\u2014": "-", // em dash
    "\u2018": "'", "\u2019": "'", // curly single quotes
    "\u201C": '"', "\u201D": '"', // curly double quotes
    "\u2192": "->", "\u2190": "<-", "\u2194": "<->", // arrows
    "\u2026": "...", // ellipsis
    "\u00A0": " ", // non-breaking space
    "\u2022": "-", // bullet
    "\u2713": "x", "\u2714": "x", "\u2610": "[ ]", "\u2611": "[x]", // check/box marks
  };
  s = s.replace(
    /[\u2212\u2013\u2014\u2018\u2019\u201C\u201D\u2192\u2190\u2194\u2026\u00A0\u2022\u2713\u2714\u2610\u2611]/g,
    (c) => map[c] ?? c
  );
  // Drop anything still outside the WinAnsi-safe Latin-1 printable range so a
  // draw can never throw. Keep space..~ plus the Latin-1 supplement (À-ÿ) and
  // the middot (·) which pdf-lib's WinAnsi does support.
  s = s.replace(/[^\x20-\x7E\u00A1-\u00FF·]/g, "?");
  return s;
}
