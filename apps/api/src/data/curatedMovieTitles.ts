// A hand-picked list of well-known, real movie titles used by the admin
// "Populate Popular Movies" bulk-import action (see
// routes/admin/externalMovies.routes.ts). This exists specifically
// because OMDb has no "trending" / "now playing" / "discover" endpoint —
// unlike TMDB, it only supports exact lookups (by id or by title), so
// there is no free way to ask it "what's popular right now." Resolving a
// curated list of real titles through OMDb's per-title lookup is the
// practical middle ground: every imported movie is still 100% real data
// (poster, runtime, genre, synopsis) — only the *selection* of which
// titles to fetch is static, not the data itself.
//
// Mixes internationally well-known titles with Bollywood titles, since
// this app's seed theatres are in Indian cities.
export const CURATED_MOVIE_TITLES: string[] = [
  // Hollywood
  "Inception",
  "The Dark Knight",
  "Interstellar",
  "The Shawshank Redemption",
  "Pulp Fiction",
  "The Matrix",
  "Fight Club",
  "Forrest Gump",
  "The Godfather",
  "Gladiator",
  "Titanic",
  "Avatar",
  "The Avengers",
  "Avengers: Endgame",
  "Spider-Man: No Way Home",
  "Oppenheimer",
  "Barbie",
  "La La Land",
  "Parasite",
  "Whiplash",
  "Joker",
  "Dune",
  "Dune: Part Two",
  "Top Gun: Maverick",
  "John Wick",
  "Mad Max: Fury Road",
  "The Grand Budapest Hotel",
  "Get Out",
  "Everything Everywhere All at Once",
  "The Social Network",
  "Django Unchained",
  "Inglourious Basterds",
  "The Wolf of Wall Street",
  "Guardians of the Galaxy",
  "Doctor Strange",
  "Black Panther",
  "Coco",
  "Toy Story",
  "Finding Nemo",
  "The Lion King",
  "Frozen",
  "Shrek",
  "Up",
  "Inside Out",
  // Bollywood / Indian cinema
  "3 Idiots",
  "Dangal",
  "PK",
  "Zindagi Na Milegi Dobara",
  "Lagaan",
  "Baahubali: The Beginning",
  "Baahubali 2: The Conclusion",
  "Gully Boy",
  "Andhadhun",
  "Queen",
  "Barfi!",
  "Taare Zameen Par",
  "Swades",
  "Chak De! India",
  "Rang De Basanti",
  "Kabhi Khushi Kabhie Gham",
  "Dilwale Dulhania Le Jayenge",
  "Sholay",
  "Article 15",
  "Uri: The Surgical Strike",
];
