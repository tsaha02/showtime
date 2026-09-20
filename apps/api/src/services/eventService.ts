import type { EventDTO } from "@showtime/shared";

// No rating aggregate here (unlike toMovieDTO) — Rating is Movie-only
// today (see the comment on `Event` in schema.prisma); events simply
// don't have a review/rating concept yet, so this is a plain,
// non-async mapper rather than a query.
export function toEventDTO(event: {
  id: string;
  title: string;
  description: string;
  category: string;
  durationMins: number;
  posterUrl: string | null;
  createdAt: Date;
}): EventDTO {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    category: event.category as EventDTO["category"],
    durationMins: event.durationMins,
    posterUrl: event.posterUrl,
    createdAt: event.createdAt.toISOString(),
  };
}
