export function bucketChartData(chartData) {
  if (!chartData || chartData.length <= 5) return chartData;

  const chunkSize = chartData.length / 5;
  const bucketed = [];
  for (let i = 0; i < 5; i++) {
    const start = Math.floor(i * chunkSize);
    const end = Math.floor((i + 1) * chunkSize);
    const chunk = chartData.slice(start, end);
    const sum = chunk.reduce((a, b) => a + b, 0);
    bucketed.push(Math.round(sum / (chunk.length || 1)));
  }
  return bucketed;
}

export function normalizeCityDisplay(slug) {
  if (typeof slug !== "string") return "Unknown";
  if (slug.toLowerCase().replace(/\s+/g, "") === "laspinas") {
    return "Las Piñas";
  }
  return slug;
}
