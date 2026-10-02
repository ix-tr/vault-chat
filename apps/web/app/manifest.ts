import type { MetadataRoute } from 'next';
import { product } from '@vault/shared';
export default function manifest(): MetadataRoute.Manifest { return { name: product.name, short_name: product.name, start_url: '/', display: 'standalone', background_color: '#f6f7f4', theme_color: '#102c2a', icons: [192,512].map(size=>({src:`/icon-${size}.png`,sizes:`${size}x${size}`,type:'image/png',purpose:'any' as const})) }; }
