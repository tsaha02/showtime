import type { EventCategory } from "@showtime/shared";

// Nicer display labels for the raw EventCategory enum (e.g.
// "THEATRE_PLAY" -> "Theatre Play"), used anywhere a category is
// rendered — the filter dropdown, chips on EventsPage/EventDetailPage.
const LABELS: Record<EventCategory, string> = {
  CONCERT: "Concert",
  COMEDY: "Comedy",
  SPORTS: "Sports",
  THEATRE_PLAY: "Theatre Play",
  WORKSHOP: "Workshop",
  OTHER: "Other",
};

export function eventCategoryLabel(category: EventCategory): string {
  return LABELS[category] ?? category;
}
