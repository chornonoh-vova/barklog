import { persistentFlag } from "@/lib/storage/flag";

const flag = persistentFlag("barklog.onboarding.seen");

export const readHasSeenOnboarding = flag.read;
export const markOnboardingSeen = flag.mark;
