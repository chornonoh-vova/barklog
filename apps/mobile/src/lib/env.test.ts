import type * as EnvModule from "@/lib/env";

type Env = typeof EnvModule;

const VARS = [
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_REVENUECAT_TEST_KEY",
  "EXPO_PUBLIC_REVENUECAT_IOS_KEY",
] as const;

function load(): Env {
  let env!: Env;
  jest.isolateModules(() => {
    env = jest.requireActual<Env>("@/lib/env");
  });
  return env;
}

describe("env", () => {
  const saved = Object.fromEntries(VARS.map((name) => [name, process.env[name]]));
  // React Native types `__DEV__` as a constant, so a release build is
  // simulated by writing it through the global object.
  const dev = __DEV__;

  afterEach(() => {
    for (const name of VARS) process.env[name] = saved[name];
    Reflect.set(globalThis, "__DEV__", dev);
  });

  it("reads the API url and Clerk key", () => {
    const env = load();

    expect(env.API_URL).toBe("https://api.barklog.test");
    expect(env.CLERK_PUBLISHABLE_KEY).toBe("pk_test_barklog");
  });

  it("uses RevenueCat's Test Store key in a development build", () => {
    Reflect.set(globalThis, "__DEV__", true);

    expect(load().REVENUECAT_API_KEY).toBe("test_revenuecat");
  });

  it("uses the App Store key in a release build", () => {
    Reflect.set(globalThis, "__DEV__", false);

    expect(load().REVENUECAT_API_KEY).toBe("appl_revenuecat");
  });

  it("does not need the iOS key in a development build", () => {
    Reflect.set(globalThis, "__DEV__", true);
    delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

    expect(load().REVENUECAT_API_KEY).toBe("test_revenuecat");
  });

  it.each(VARS.map((name) => [name]))("names %s and where to add it when it is missing", (name) => {
    Reflect.set(globalThis, "__DEV__", name !== "EXPO_PUBLIC_REVENUECAT_IOS_KEY");
    process.env[name] = "";

    expect(load).toThrow(`Missing ${name}. Add it to apps/mobile/.env — see .env.example.`);
  });
});
