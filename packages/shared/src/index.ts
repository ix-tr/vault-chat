import { z } from 'zod';
export const product = { name: 'Vault Chat' } as const;
export const text = {
 privateDesign: 'PRIVATE BY DESIGN', privateEyebrow: 'A LITTLE MORE PRIVATE',
 historyNote: 'Your history stays on your devices.', pending: 'Cryptography review pending',
 accountStage: 'Account activation preview', accountDetail: 'Activate with your private link or unlock your existing device. Encrypted messaging is the next phase.', signIn: 'Sign in with passkey', accountFooter: 'Account preview · Private device keys stay encrypted on your device',
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
export const authText = {
  activate:'Activate your account',login:'Unlock your account',
  activationIntro:'Use your private activation link to set up a passkey and keys on this device.',
  loginIntro:'Your passkey signs you in. Your private keys stay on this device.',
  activationAction:'Create passkey and activate',loginAction:'Sign in with passkey',working:'Working…',
  newPassword:'Choose a local password',unlockPassword:'Unlock your device keys',password:'Local password',confirmPassword:'Confirm local password',
  passwordHint:'This passkey cannot unlock device storage directly. Your local password protects your private keys and is never sent to the server. Keep it safe; administrators cannot recover it.',
  localUnlockHint:'Enter the local password you chose on this device. It is never sent to the server.',
  continue:'Continue',cancel:'Cancel',signedIn:'Your device is unlocked',signedInDetail:'Your account and encrypted device keys are ready. Encrypted messaging is the next phase.',
  signOut:'Sign out and lock',locked:'This device is locked.',back:'Back to Vault Chat',alreadyActivated:'Already activated? Sign in',
  storageWarning:'Browser storage may be cleared. Keep this device’s data; encrypted backup and device linking will arrive in a later phase.',
  unsupported:'This browser cannot use passkeys and encrypted device storage. Open a supported browser over HTTPS.',
  notReady:'Account activation is not available on this deployment yet.',invalidLink:'This activation link is missing, expired or already used. Try signing in if you previously completed activation.',
  missingDevice:'No device keys were found here. A synced passkey does not restore chat keys. Use your original device; device linking arrives in a later phase.',
  prfRequired:'This device requires its original passkey’s storage-unlock support. Try the original browser and passkey; a password cannot replace it.',
  badPassword:'The local password could not unlock your keys, or device storage is damaged. Try again without resetting your keys.',
  badStorage:'Encrypted device storage is unavailable or changed. Keep the existing data and try the original browser.',
  deviceExists:'This browser already has device keys. Sign in to that account; activation will not replace existing keys.',
  cancelled:'Passkey setup or sign-in was cancelled. You can try again.',
  network:'Reconnect to continue. Existing device keys have been kept.',rate:'Too many attempts. Wait before trying again.',
  failed:'Authentication could not be completed. Try again, or sign in if activation may already have completed.',
  length:'Password length is not supported. Try a longer or shorter password.',mismatch:'The local passwords do not match.',
} as const;
export const originSchema = z.string().url().refine(value => new URL(value).protocol === 'https:', 'HTTPS required');
export function assertSeparateOrigins(chat: string, admin: string) {
 const a = new URL(originSchema.parse(chat)); const b = new URL(originSchema.parse(admin));
 if (a.hostname === b.hostname) throw new Error('Chat and admin require different hostnames');
}
