/**
 * Cycle detection utility for task parent-child relationships
 * Decoupled from TaskService so it can be tested without a database.
 */

/**
 * Check whether setting a new parent would create a circular reference.
 *
 * @param taskId          - The task that would become a child
 * @param proposedParentId - The proposed new parent (null = remove parent)
 * @param getParentId     - Callback that returns the parent_id of a task (null if no parent / not found)
 * @returns true if assigning proposedParentId as parent of taskId would create a cycle
 */
export function wouldCreateCycle(
  taskId: number,
  proposedParentId: number | null,
  getParentId: (id: number) => number | null
): boolean {
  if (!proposedParentId) return false;
  if (taskId === proposedParentId) return true;

  let currentId: number | null = proposedParentId;
  const visited = new Set<number>();

  while (currentId !== null) {
    if (visited.has(currentId) || currentId === taskId) {
      return true;
    }
    visited.add(currentId);
    currentId = getParentId(currentId);
  }

  return false;
}
