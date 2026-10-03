import { Shell } from '../components/shell';
export default function Page() { return <Shell authEnabled={process.env.VAULT_AUTH_ENABLED === 'true'} />; }
