import { redirect } from 'next/navigation';

export default function NexusTokensLegacyRedirectPage() {
  redirect('/nexus/setup');
}
