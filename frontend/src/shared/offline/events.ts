/** In-tab + cross-tab notification that the local queue changed so UIs re-read IndexedDB. */
export const queueEvents = new EventTarget();
export const QUEUE_CHANGED = "queue-changed";

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel("ner-field-queue");
    channel.onmessage = () => queueEvents.dispatchEvent(new Event(QUEUE_CHANGED));
  }
  return channel;
}

export function notifyQueueChanged(): void {
  queueEvents.dispatchEvent(new Event(QUEUE_CHANGED));
  try {
    getChannel()?.postMessage("changed");
  } catch {
    /* closed channel; local listeners were already notified */
  }
}
