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
    return "gg.barklog.app.preview";
  }

  return "Barklog";
};

export default ({ config }) => ({
  ...config,
  name: getAppName(),
  ios: {
    ...config.ios,
    bundleIdentifier: getUniqueIdentifier(),
  },
  android: {
    ...config.android,
    package: getUniqueIdentifier(),
  },
});
