/** The pages the About screen links to. Privacy and Terms must be reachable
 * from inside the app (App Review 5.1.1(i), 3.1.2); IGDB's terms ask for
 * credit wherever its data appears. */
export const ABOUT_LINKS = {
  privacy: "https://barklog.gg/privacy",
  terms: "https://barklog.gg/terms",
  support: "https://barklog.gg/support",
  igdb: "https://www.igdb.com",
  source: "https://github.com/chornonoh-vova/barklog",
  creator: "https://chornonoh-vova.com",
} as const;
