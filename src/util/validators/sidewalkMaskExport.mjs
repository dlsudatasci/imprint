import { pseudonymize } from "./retrainingExport.mjs";

/**
 * Rows for `scripts/export-data.mjs --masks` (6 Oct 2026). Plain .mjs with no
 * "@/" imports, since the script imports it with Node.
 *
 *   rows            completed annotator outlines on non-reference images
 *                   (model-development), for training and evaluation
 *   agreementRows   completed annotator outlines on the 30 reference images
 *                   flagged sidewalkAgreement: true, for agreement between
 *                   annotators only, never for training (chapter_4.tex line 116)
 *
 * An outline on any other reference image should not exist (the server stores
 * null there) and is excluded and counted.
 *
 * The polygons are passed through as stored (display-copy pixels). The pixel
 * masks are drawn from them outside IMPRINT: the mask is the union of the
 * walking-space polygons, and an empty mask for noSidewalk. letterbox maps the display
 * copy to the 640 by 640 model copy. date is the annotation's date as an ISO
 * string, or null, so the review script can sort by it.
 */
function isoDate(value) {
  if (value == null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function buildSidewalkMaskRows({ annotations, imageMap }) {
  const summary = {
    rows: 0,
    noSidewalkRows: 0,
    agreementRows: 0,
    agreementNoSidewalkRows: 0,
    excludedReference: 0,
    excludedMissingImage: 0,
  };
  const rows = [];
  const agreementRows = [];

  for (const ann of annotations || []) {
    if (ann?.source !== "annotator" || ann.status !== "completed" || ann.sidewalkMask == null) continue;

    const img = imageMap.get(ann.imageID);
    if (!img) {
      summary.excludedMissingImage++;
      continue;
    }
    const agreement = img.isReference === true && img.sidewalkAgreement === true;
    if (img.isReference && !agreement) {
      summary.excludedReference++;
      continue;
    }

    const noSidewalk = ann.sidewalkMask.noSidewalk === true;
    const row = {
      imageID: ann.imageID,
      imageName: img.imageName ?? null,
      source: ann.source,
      city: img.city ?? ann.city ?? null,
      width: img.width ?? null,
      height: img.height ?? null,
      letterbox: img.letterbox ?? null,
      pseudoUserId: pseudonymize(ann.userId),
      date: isoDate(ann.date),
      noSidewalk,
      polygons: ann.sidewalkMask.polygons ?? [],
    };

    if (agreement) {
      agreementRows.push(row);
      summary.agreementRows++;
      if (noSidewalk) summary.agreementNoSidewalkRows++;
    } else {
      rows.push(row);
      summary.rows++;
      if (noSidewalk) summary.noSidewalkRows++;
    }
  }

  return { rows, agreementRows, summary };
}

/** One JSON object per line. */
export function toJsonl(rows) {
  return rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
}
