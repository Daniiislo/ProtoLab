import type {
  Notification,
  NotificationBatch,
  Order,
  Payment,
  Progress,
} from "../lib/protocol-contracts";

type Subscriber = { send: (progress: Progress) => void; close: () => void };
type SessionState = {
  touchedAt: number;
  order: Order;
  notifications: Notification[];
  cursor: number;
  waiters: Set<() => void>;
  progress: Progress;
  subscribers: Set<Subscriber>;
  timer?: ReturnType<typeof setInterval>;
  payment: Payment;
  paymentInFlight: boolean;
};

const globalStore = globalThis as typeof globalThis & {
  protoLabSessions?: Map<string, SessionState>;
};
// ponytail: memory trong một process, dùng Redis nếu chạy nhiều server; restart sẽ mất state.
const sessions = (globalStore.protoLabSessions ??= new Map<string, SessionState>());

export const initialProgress = (): Progress => ({
  progress: 0,
  step: "Sẵn sàng xử lý báo cáo",
  done: false,
});
export const initialPayment = (): Payment => ({
  status: "pending",
  eventId: null,
  updatedAt: null,
});

export function getSession(id: string): SessionState {
  const now = Date.now();
  // Thu hồi phiên không hoạt động sau một giờ, không ngắt request đang chạy.
  for (const [key, state] of sessions) {
    if (
      now - state.touchedAt > 3_600_000 &&
      !state.waiters.size &&
      !state.subscribers.size &&
      !state.paymentInFlight
    ) {
      if (state.timer) clearInterval(state.timer);
      sessions.delete(key);
    }
  }
  let state = sessions.get(id);
  if (!state) {
    if (sessions.size >= 1000)
      throw Response.json(
        { error: "Demo đã đạt giới hạn 1.000 phiên. Hãy khởi động lại server." },
        { status: 503 },
      );
    state = {
      touchedAt: now,
      order: { step: 0, updatedAt: new Date().toISOString() },
      notifications: [],
      cursor: 0,
      waiters: new Set(),
      progress: initialProgress(),
      subscribers: new Set(),
      payment: initialPayment(),
      paymentInFlight: false,
    };
    sessions.set(id, state);
  }
  state.touchedAt = now;
  return state;
}

export function notificationBatch(
  state: SessionState,
  after: number,
  timedOut = false,
): NotificationBatch {
  return {
    events: state.notifications.filter((event) => event.id > after),
    cursor: state.cursor,
    timedOut,
  };
}

export function waitForNotification(
  state: SessionState,
  after: number,
  signal: AbortSignal,
): Promise<NotificationBatch> {
  if (state.cursor > after || signal.aborted)
    return Promise.resolve(notificationBatch(state, after));
  // Request được giữ lại; POST sẽ gọi wake để trả response ngay khi có sự kiện.
  return new Promise((resolve) => {
    const finish = (timedOut = false) => {
      clearTimeout(timeout);
      state.waiters.delete(wake);
      signal.removeEventListener("abort", abort);
      resolve(notificationBatch(state, after, timedOut));
    };
    const wake = () => finish();
    const abort = () => finish();
    const timeout = setTimeout(() => finish(true), 20_000);
    state.waiters.add(wake);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

export function publishNotification(state: SessionState, text?: string) {
  state.cursor += 1;
  if (text) {
    state.notifications.push({ id: state.cursor, text, createdAt: new Date().toISOString() });
    state.notifications = state.notifications.slice(-50);
  } else state.notifications = [];
  for (const wake of state.waiters) wake();
}

export function subscribeToProgress(state: SessionState, subscriber: Subscriber) {
  state.subscribers.add(subscriber);
  return () => {
    state.subscribers.delete(subscriber);
    if (!state.subscribers.size && state.timer) {
      clearInterval(state.timer);
      state.timer = undefined;
    }
  };
}

export function resetProgress(state: SessionState) {
  if (state.timer) clearInterval(state.timer);
  state.timer = undefined;
  state.progress = initialProgress();
  for (const subscriber of state.subscribers) subscriber.send(state.progress);
}

export function startProgress(state: SessionState) {
  if (state.timer) return false;
  state.progress = { progress: 0, step: "Đang chuẩn bị dữ liệu", done: false };
  for (const subscriber of state.subscribers) subscriber.send(state.progress);
  const steps = [
    "Đọc dữ liệu",
    "Kiểm tra bản ghi",
    "Tổng hợp số liệu",
    "Tạo biểu đồ",
    "Xuất báo cáo",
    "Báo cáo đã hoàn thành",
  ];
  let tick = 0;
  state.timer = setInterval(() => {
    tick += 1;
    state.progress = {
      progress: Math.round((tick / steps.length) * 100),
      step: steps[tick - 1]!,
      done: tick === steps.length,
    };
    for (const subscriber of state.subscribers) subscriber.send(state.progress);
    if (state.progress.done) {
      clearInterval(state.timer);
      state.timer = undefined;
      for (const subscriber of [...state.subscribers]) subscriber.close();
    }
  }, 1000);
  return true;
}
