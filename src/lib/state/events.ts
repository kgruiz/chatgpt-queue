import type { QueueState } from "../state";

export type QueueStateChangeReason = string;

export interface QueueStateEventDetail {
  reason: QueueStateChangeReason;
  detail?: Record<string, unknown>;
  timestamp: number;
}

export type QueueStateListener = (
  state: QueueState,
  event: QueueStateEventDetail,
) => void;

export interface QueueStateEmitter {
  emit(reason?: QueueStateChangeReason, detail?: Record<string, unknown>): void;
  subscribe(listener: QueueStateListener): () => void;
  once(listener: QueueStateListener): () => void;
}

export const createQueueStateEmitter = (state: QueueState): QueueStateEmitter => {
  const listeners = new Set<QueueStateListener>();

  const emit = (
    reason: QueueStateChangeReason = "state:change",
    detail?: Record<string, unknown>,
  ) => {
    const event: QueueStateEventDetail = {
      reason,
      detail,
      timestamp: Date.now(),
    };
    listeners.forEach((listener) => {
      try {
        listener(state, event);
      } catch (error) {
        console.error("[cq] state listener failed", error);
      }
    });
  };

  const subscribe = (listener: QueueStateListener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const once = (listener: QueueStateListener) => {
    const unsubscribe = subscribe((queueState, event) => {
      unsubscribe();
      listener(queueState, event);
    });
    return unsubscribe;
  };

  return { emit, subscribe, once };
};
