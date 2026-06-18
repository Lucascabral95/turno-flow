import { PublicBooking } from "../../ui/public-booking";

export default async function PublicBusinessBookPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;

  return <PublicBooking businessSlug={businessSlug} />;
}
