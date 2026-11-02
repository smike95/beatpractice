/**
 * Who this installation belongs to: an account / licence id. Packs (.beatpack) carry the id of their maker; a pack from another owner
 * is opened only after the user confirms that passing it on is their responsibility.
 * There is no licence system yet, so the id is empty and no check is made. When it appears, return its id here and nothing else changes.
 */
export function getOwnerId(): string {
  return "";
}
