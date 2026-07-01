import { SubmitReview } from "../../ui/submit-review";

export default async function SubmitReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return <SubmitReview token={token} />;
}
