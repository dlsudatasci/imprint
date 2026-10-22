/**
 * The obstruction chart in a recent session's row.
 *
 * 22 Oct 2026, first pass (dataviz and apple-design): it was five columns, the
 * session averaged into five, with nothing to say what a column was. It got a
 * line saying how many obstructions in how many photos.
 *
 * 22 Oct 2026, second pass (Rans): one column per photo across the row was
 * too many to read at 50, and the compact look was better. Now the columns
 * stay compact, side by side, one per photo up to ten; a longer session
 * groups neighbouring photos into ten columns. A grouped column is as tall as
 * its photos' average, since groups can differ by a photo, and says its total.
 */
export const MAX_CHART_COLUMNS = 10;

const asCount = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : 0);

/**
 * The columns for these per-photo counts: { from, to, value, mean }, photos
 * numbered from 1, value the total of the column's photos and mean that per
 * photo. One per photo up to `max`; past it, `max` runs of neighbouring
 * photos, as even as they divide.
 */
export function chartColumns(counts, max = MAX_CHART_COLUMNS) {
  const list = Array.isArray(counts) ? counts.map(asCount) : [];
  if (list.length <= max) return list.map((value, i) => ({ from: i + 1, to: i + 1, value, mean: value }));
  const columns = [];
  for (let i = 0; i < max; i++) {
    const start = Math.floor((i * list.length) / max);
    const end = Math.floor(((i + 1) * list.length) / max);
    const value = list.slice(start, end).reduce((a, b) => a + b, 0);
    columns.push({ from: start + 1, to: end, value, mean: value / (end - start) });
  }
  return columns;
}

/**
 * What the chart says in words: the session's total, its number of photos,
 * and the tallest column (the first of them when several tie), or null when
 * there are none at all.
 */
export function chartSummary(counts, columns = chartColumns(counts)) {
  const list = Array.isArray(counts) ? counts.map(asCount) : [];
  const total = list.reduce((a, b) => a + b, 0);
  let peak = null;
  for (const column of columns) if (column.mean > 0 && (!peak || column.mean > peak.mean)) peak = column;
  return { total, photos: list.length, peak };
}
