export function getManilaDateString(dateObj) {
  const manilaDate = new Date(dateObj.getTime() + 8 * 60 * 60 * 1000);
  return manilaDate.toISOString().split("T")[0];
}

export function calculateStreak(sortedDatesDescending) {
  if (!sortedDatesDescending || sortedDatesDescending.length === 0) return 0;

  const today = new Date();
  const todayString = getManilaDateString(today);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayString = getManilaDateString(yesterday);

  const mostRecentString = sortedDatesDescending[0];

  if (mostRecentString !== todayString && mostRecentString !== yesterdayString) {
    return 0;
  }

  let streak = 0;
  let checkDate = new Date(mostRecentString + "T00:00:00Z");

  for (const dateStr of sortedDatesDescending) {
    const expectedString = checkDate.toISOString().split("T")[0];
    if (dateStr === expectedString) {
      streak++;
      checkDate.setUTCDate(checkDate.getUTCDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}
