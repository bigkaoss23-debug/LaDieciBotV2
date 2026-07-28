export const OPERATIONAL_TRANSACTION_MIN_DURATION_MS = 1500;

export const operationalFeedback = ({
  phase,
  title,
  startedAt,
  minDuration = OPERATIONAL_TRANSACTION_MIN_DURATION_MS,
}) => ({
  phase,
  title,
  subtitle: null,
  startedAt,
  minDuration,
});

export async function runOperationalTransaction({
  now = Date.now,
  startedAt: existingStartedAt,
  pendingAlreadyPublished = false,
  optimisticTitle = null,
  pendingTitle,
  successTitle,
  beforeRequest,
  publishFeedback,
  request,
  onSuccess,
  onFailure,
}) {
  const startedAt = existingStartedAt ?? now();
  if (!pendingAlreadyPublished) {
    const shouldContinue = beforeRequest?.(startedAt);
    if (shouldContinue === false) return { skipped: true };

    publishFeedback(operationalFeedback({
      phase: optimisticTitle ? "success" : "pending",
      title: optimisticTitle || pendingTitle,
      startedAt,
    }));
  }

  try {
    const response = await request();
    await onSuccess?.(response);
    if (!optimisticTitle) {
      publishFeedback(operationalFeedback({
        phase: "success",
        title: successTitle,
        startedAt,
      }));
    }
    return { skipped: false, response, startedAt };
  } catch (error) {
    publishFeedback(null);
    await onFailure?.(error);
    throw error;
  }
}
