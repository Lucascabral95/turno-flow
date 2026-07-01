import { Unsubscribe } from "../../ui/unsubscribe";

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return <Unsubscribe token={token} />;
}
