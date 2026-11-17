import "i18next";

import type { AppResources } from "@repo/i18n";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "app";
    resources: { app: AppResources };
  }
}
