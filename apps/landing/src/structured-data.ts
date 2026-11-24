import type { Language } from "@repo/i18n";

import { APP_STORE_URL } from "./config";
import { copy, faqEntries, homePath } from "./i18n";

const SITE = "https://barklog.gg";

/**
 * The facts a search engine or an answer engine should be able to quote
 * without parsing prose: what Barklog is, where it runs, what it costs, and
 * the FAQ word for word as the page shows it. No aggregateRating: a rating
 * here would have to be kept in step with the App Store by hand.
 */
export function homeJsonLd(lang: Language): object[] {
  const t = copy(lang);
  const url = `${SITE}${homePath(lang)}`;

  return [
    {
      "@context": "https://schema.org",
      "@type": "MobileApplication",
      name: "Barklog",
      url,
      description: t.meta.description,
      inLanguage: lang,
      operatingSystem: "iOS, iPadOS",
      applicationCategory: "LifestyleApplication",
      installUrl: APP_STORE_URL,
      sameAs: [APP_STORE_URL],
      image: `${SITE}/og.png`,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      author: { "@type": "Person", name: "Volodymyr Chornonoh" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: lang,
      mainEntity: faqEntries(lang).map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Barklog",
      url,
      inLanguage: lang,
    },
  ];
}
