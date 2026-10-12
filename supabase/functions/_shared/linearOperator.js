/** Only explicitly configured Linear users may issue review commands. */
export function isLinearOperator(payload, operatorIds) {
  const allowed = new Set(operatorIds.split(',').map((id) => id.trim()).filter(Boolean));
  // The author of a comment is data.userId. Linear's event actor may differ.
  if (payload?.type === 'Comment') return allowed.has(payload.data?.userId);
  // A state change has no comment author, so authorize its event actor.
  return payload?.type === 'Issue' && payload.actor?.type === 'user' && allowed.has(payload.actor.id);
}
