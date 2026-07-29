export const BROWSER_PRINT_OUTCOMES = Object.freeze({
  DIALOG_OPENED: "dialog_opened",
  USER_OUTCOME_UNKNOWN: "user_outcome_unknown",
  FAILED: "failed",
});

let dialogActive = false;

export function createBrowserPrintAdapter({ printFunction } = {}) {
  const invokePrint = printFunction || (() => window.print());

  return Object.freeze({
    async print({ onStatus } = {}) {
      if (dialogActive) {
        return Object.freeze({
          status: BROWSER_PRINT_OUTCOMES.FAILED,
          ok: false,
          error_code: "PRINT_DIALOG_IN_PROGRESS",
        });
      }

      dialogActive = true;
      try {
        onStatus?.(BROWSER_PRINT_OUTCOMES.DIALOG_OPENED);
        await invokePrint();
        onStatus?.(BROWSER_PRINT_OUTCOMES.USER_OUTCOME_UNKNOWN);
        return Object.freeze({
          status: BROWSER_PRINT_OUTCOMES.USER_OUTCOME_UNKNOWN,
          ok: false,
          error_code: null,
        });
      } catch (_) {
        onStatus?.(BROWSER_PRINT_OUTCOMES.FAILED);
        return Object.freeze({
          status: BROWSER_PRINT_OUTCOMES.FAILED,
          ok: false,
          error_code: "PRINT_DIALOG_FAILED",
        });
      } finally {
        dialogActive = false;
      }
    },
  });
}
