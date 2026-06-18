import { PublicBusinessLanding } from "../ui/public-booking";

export default async function PublicBusinessPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;

  return <PublicBusinessLanding businessSlug={businessSlug} />;
}
