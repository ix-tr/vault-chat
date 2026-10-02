import { z } from 'zod';
export const product = { name: 'Vault Chat' } as const;
export const text = {
 privateDesign: 'PRIVATE BY DESIGN', privateEyebrow: 'A LITTLE MORE PRIVATE',
 historyNote: 'Your history stays on your devices.', pending: 'Cryptography review pending',
 previewFooter: 'Foundation preview · No messages or keys are stored', light: 'Light theme', dark: 'Dark theme',
 offlineSetupError: 'Offline setup unavailable.', accessUnavailable: 'Access unavailable', adminLabel: 'Admin',
 description: 'Private conversations on your devices',
 title: 'Your conversations. Your keys.', intro: 'A private space for conversations, built around your devices.',
 stage: 'Local development · Foundation preview', empty: 'No conversations yet',
 emptyDetail: 'Account activation and encrypted messaging arrive after the cryptography review.',
 chats: 'Chats', settings: 'Settings', theme: 'Toggle theme', install: 'Install this app',
 installHelp: 'If your browser has no install button, open its Share or menu controls and choose Add to Home Screen. On iPhone, push notifications require installation.',
 storage: 'Request persistent storage', storageOk: 'Persistent storage granted.',
 storageNo: 'Persistent storage is unavailable or was not granted. Browser storage can be evicted; encrypted backup will be available in a later phase.',
 storageError: 'Storage permission could not be requested.',
 adminTitle: 'Administration', adminDetail: 'A separate origin and session protect administrative access.',
 adminGate: 'Passkey authentication is not implemented yet. Administrative actions are unavailable.',
 offline: 'You are offline', offlineDetail: 'Reconnect to open Vault Chat. No conversations are cached by this preview.'
} as const;
export const originSchema = z.string().url().refine(value => new URL(value).protocol === 'https:', 'HTTPS required');
export function assertSeparateOrigins(chat: string, admin: string) {
 const a = new URL(originSchema.parse(chat)); const b = new URL(originSchema.parse(admin));
 if (a.hostname === b.hostname) throw new Error('Chat and admin require different hostnames');
}
