/** Return only the latest due stage; never send several missed reminders at once. */
export function reminderStage(startsAt: Date, now: Date, offsets: number[]) {
  const stages = [...new Set(offsets)].sort((a, b) => b - a);
  const start = startsAt.getTime();
  for (let index = stages.length - 1; index >= 0; index--) {
    const minutes = stages[index];
    const dueAt = new Date(start - minutes * 60000);
    // Polling runs once a minute. The final one-hour reminder has a one-minute delivery window.
    const expiresAt = new Date(index + 1 < stages.length ? start - stages[index + 1] * 60000 : dueAt.getTime() + 60000);
    if (now >= dueAt && now < expiresAt) return { minutes, dueAt, expiresAt };
  }
  return null;
}
