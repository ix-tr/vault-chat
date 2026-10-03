// Fault fixture only: simulate Worker loss after durable commit, before its reply.
import './state-worker.mjs';
const originalPost = self.postMessage.bind(self);
const originalHandler = self.onmessage;
let armed = false;
self.onmessage = (event) => {
  if (event.data.op === 'armLostReply') {
    armed = true;
    originalPost({ id: event.data.id, ok: true, result: true });
  } else originalHandler(event);
};
self.postMessage = (message) => {
  if (armed && message.ok && message.result instanceof Uint8Array) {
    // Release no ciphertext; the test receives only a simulated transport error.
    originalPost({ id: message.id, ok: false, code: 'REPLY_LOST' });
    setTimeout(() => self.close(), 0);
    return;
  }
  originalPost(message);
};
