// Greeting for the home header, based on the browser's local clock.
// 5:00–11:59 morning, 12:00–16:59 afternoon, otherwise evening.
export function getTimeOfDayGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}
