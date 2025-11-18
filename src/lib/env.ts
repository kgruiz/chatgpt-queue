export const isDebugSendEnabled = (): boolean =>
  (typeof import.meta !== "undefined" &&
    typeof (import.meta as { env?: Record<string, unknown> }).env !== "undefined" &&
    (import.meta as { env?: Record<string, unknown> }).env?.CQ_DEBUG_SEND === "1") ||
  (typeof process !== "undefined" &&
    typeof process.env !== "undefined" &&
    process.env.CQ_DEBUG_SEND === "1");
