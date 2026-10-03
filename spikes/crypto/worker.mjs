// Evaluation only: unchanged upstream MLS operations, with ephemeral worker state.
import init, { Provider, Identity, Group, KeyPackage, RatchetTree } from './generated/openmls_wasm.js';

const ready = init();
let provider;
let identity;
let group;
const bytes = (value) => new Uint8Array(value);

self.onmessage = async ({ data: { id, op, value } }) => {
  try {
    await ready;
    let result;
    switch (op) {
      case 'init':
        provider = new Provider();
        identity = new Identity(provider, value);
        result = true;
        break;
      case 'keyPackage': {
        const kp = identity.key_package(provider);
        result = Array.from(kp.to_bytes());
        kp.free();
        break;
      }
      case 'create':
        group = Group.create_new(provider, identity, value);
        result = true;
        break;
      case 'add': {
        const kp = KeyPackage.from_bytes(bytes(value));
        const messages = group.propose_and_commit_add(provider, identity, kp);
        result = Object.fromEntries(['proposal', 'commit', 'welcome'].map((key) => [key, Array.from(messages[key])]));
        messages.free();
        kp.free();
        group.merge_pending_commit(provider);
        const tree = group.export_ratchet_tree();
        result.tree = Array.from(tree.to_bytes());
        tree.free();
        break;
      }
      case 'join':
        // join consumes the decoded tree; no JS key material crosses workers.
        group = Group.join(provider, bytes(value.welcome), RatchetTree.from_bytes(bytes(value.tree)));
        result = true;
        break;
      case 'send':
        result = Array.from(group.create_message(provider, identity, bytes(value)));
        break;
      case 'receive':
        result = Array.from(group.process_message(provider, bytes(value)));
        break;
      default:
        throw new Error('Unknown spike operation');
    }
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    // Do not forward raw library errors or keys to logs. Tests inspect the error class.
    self.postMessage({ id, ok: false, errorType: error?.constructor?.name ?? 'Error' });
  }
};
