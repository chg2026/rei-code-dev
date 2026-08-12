import SignupClient from "./SignupClient";

export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ projectToken?: string; token?: string }> }) {
  const sp = await searchParams;
  return <SignupClient projectToken={sp.projectToken || ""} legacyToken={sp.token || ""} />;
}
