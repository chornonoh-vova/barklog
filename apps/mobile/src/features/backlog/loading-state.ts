/** Home's background-refresh pill: only over data already on screen, and never
 * alongside the native spinner of a pull the user started. */
export function showUpdatingPill(state: {
  hasData: boolean;
  isFetching: boolean;
  userRefreshing: boolean;
}): boolean {
  return state.hasData && state.isFetching && !state.userRefreshing;
}
