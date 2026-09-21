const IS_DEV = process.env.APP_VARIANT === "development";
const IS_PREVIEW = process.env.APP_VARIANT === "preview";

const getUniqueIdentifier = () => {
  if (IS_DEV) {
    return "gg.barklog.app.dev";
  }

  if (IS_PREVIEW) {
    return "gg.barklog.app.preview";
  }

  return "gg.barklog.app";
};

const getAppName = () => {
  if (IS_DEV) {
    return "Barklog (Dev)";
  }

  if (IS_PREVIEW) {
    return "Barklog (Preview)";
  }

  return "Barklog";
};

const APP_GROUPS_ENTITLEMENT = "com.apple.security.application-groups";

export default ({ config }) => {
  const bundleIdentifier = getUniqueIdentifier();
  // `expo-sharing` defaults the extension's app group to `group.<bundleIdentifier>`,
  // so the app and the extension have to follow the variant or their entitlements
  // stop matching what the plugin generates. Production stays `group.gg.barklog.app`.
  const appGroupIdentifier = `group.${bundleIdentifier}`;
  const easBuild = config.extra?.eas?.build ?? {};
  const experimentalIos = easBuild.experimental?.ios ?? {};

  return {
    ...config,
    name: getAppName(),
    ios: {
      ...config.ios,
      bundleIdentifier,
      entitlements: {
        ...config.ios?.entitlements,
        [APP_GROUPS_ENTITLEMENT]: [appGroupIdentifier],
      },
    },
    android: {
      ...config.android,
      package: bundleIdentifier,
    },
    extra: {
      ...config.extra,
      eas: {
        ...config.extra?.eas,
        build: {
          ...easBuild,
          experimental: {
            ...easBuild.experimental,
            ios: {
              ...experimentalIos,
              // An app extension's bundle ID has to be prefixed by its parent app's, so it
              // must follow the variant too. Deriving the suffix from `targetName` keeps
              // production byte-identical to what app.json hardcoded.
              appExtensions: experimentalIos.appExtensions?.map((extension) => ({
                ...extension,
                bundleIdentifier: `${bundleIdentifier}.${extension.targetName}`,
                entitlements: {
                  ...extension.entitlements,
                  [APP_GROUPS_ENTITLEMENT]: [appGroupIdentifier],
                },
              })),
            },
          },
        },
      },
    },
  };
};
