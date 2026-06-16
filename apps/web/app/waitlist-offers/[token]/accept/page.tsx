import { AcceptWaitlistOffer } from "../../../ui/accept-waitlist-offer";

export default async function AcceptWaitlistOfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return <AcceptWaitlistOffer token={token} />;
}
