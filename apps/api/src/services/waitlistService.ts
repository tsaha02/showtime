import { prisma } from "../lib/prisma";
import { sendWaitlistNotifyEmail } from "./emailService";

export async function joinWaitlist(movieId: string, email: string): Promise<void> {
  // upsert, not create: re-joining after already being notified (e.g. a
  // second wave of shows for the same movie later) should re-arm the
  // notification rather than silently no-op forever on the unique
  // (movieId, email) constraint.
  await prisma.waitlist.upsert({
    where: { movieId_email: { movieId, email } },
    create: { movieId, email },
    update: { notifiedAt: null },
  });
}

// Called from the admin show-creation / auto-schedule paths right after
// a Show is created — see admin/shows.routes.ts. Fire-and-forget for the
// same reason every other email in this app is: notifying a waitlist is
// never allowed to slow down or fail the admin action that triggered it.
export async function notifyWaitlistForMovie(movieId: string): Promise<void> {
  const entries = await prisma.waitlist.findMany({
    where: { movieId, notifiedAt: null },
    include: { movie: true },
  });
  if (entries.length === 0) return;

  const ids = entries.map((e) => e.id);
  await prisma.waitlist.updateMany({ where: { id: { in: ids } }, data: { notifiedAt: new Date() } });

  for (const entry of entries) {
    void sendWaitlistNotifyEmail(entry.email, entry.movie.title);
  }
}
