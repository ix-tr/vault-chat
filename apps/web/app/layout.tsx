import { connection } from 'next/server';
import type { Metadata, Viewport } from 'next';
import { product, text } from '@vault/shared';
import './globals.css';
export const metadata: Metadata = { title: product.name, description: text.description, manifest: '/manifest.webmanifest' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#102c2a' };
export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) { await connection(); return <html lang="en"><body>{children}</body></html>; }
