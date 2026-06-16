import { CancelAppointment } from "../../ui/cancel-appointment";

export default async function CancelAppointmentPage({ params }: { params: Promise<{ appointmentId: string }> }) {
  const { appointmentId } = await params;

  return <CancelAppointment appointmentId={appointmentId} />;
}
