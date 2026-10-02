import { connection } from 'next/server';
import { product, text } from '@vault/shared';
import './globals.css';
export const metadata = { title: `${product.name} ${text.adminLabel}` };
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default async function Layout({children}:Readonly<{children:React.ReactNode}>){await connection();return <html lang="en"><body>{children}</body></html>;}
