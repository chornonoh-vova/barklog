// Runs before any module loads, so `src/lib/env.ts` reads these instead of
// throwing. Fixed values, not `.env`: a test must not depend on a developer's
// machine, and CI has no `.env` at all.
process.env.EXPO_PUBLIC_API_URL = "https://api.barklog.test";
process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_barklog";
process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY = "test_revenuecat";
process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = "appl_revenuecat";
