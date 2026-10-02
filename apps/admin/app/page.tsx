import { text, product } from '@vault/shared';
export default function Admin(){return <main><span>{product.name} · {text.adminLabel}</span><h1>{text.adminTitle}</h1><p>{text.adminDetail}</p><section><h2>{text.accessUnavailable}</h2><p>{text.adminGate}</p></section></main>;}
