import { persistentFlag } from "@/storage/flag";

const flag = persistentFlag("barklog.review.asked");

export const readHasAskedForReview = flag.read;
export const markAskedForReview = flag.mark;
