/** Removal discards the status and the rating, and there is no undo. */
export function removeConfirmCopy(name: string) {
  return {
    title: `Remove “${name}”?`,
    message: "Its status and rating will be lost.",
    confirm: "Remove",
    cancel: "Cancel",
  };
}
