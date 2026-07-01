"use client";

import { Star } from "lucide-react";
import { useMemo } from "react";

import type { AppointmentReview } from "../../../lib/api";
import { formatDateTime } from "../../../lib/api";
import { EmptyState } from "./dashboard-shared";
import styles from "./dashboard-reviews.module.scss";

export function ReviewsView({ reviews }: { reviews: AppointmentReview[] }) {
  const submittedReviews = useMemo(() => reviews.filter((review) => review.submittedAt !== null), [reviews]);
  const averageRating = useMemo(() => {
    const rated = submittedReviews.filter((review) => review.rating !== null);
    if (rated.length === 0) return null;
    const total = rated.reduce((sum, review) => sum + (review.rating ?? 0), 0);
    return total / rated.length;
  }, [submittedReviews]);

  return (
    <section className={`stack ${styles.reviewsView}`}>
      <section className="feature-banner dashboard-section-banner">
        <div>
          <span className="badge badge-soft">Feedback de clientes</span>
          <h2>Las reseñas que dejan tus clientes despues de cada turno completado.</h2>
          <p>Se piden automaticamente por email apenas marcas un turno como completado.</p>
        </div>
        <div className="dashboard-banner-stats">
          <div className={styles.statCard}>
            <span>Promedio</span>
            <strong>{averageRating !== null ? averageRating.toFixed(1) : "-"}</strong>
          </div>
          <div className={styles.statCard}>
            <span>Respondidas</span>
            <strong>{submittedReviews.length}</strong>
          </div>
          <div className={styles.statCard}>
            <span>Pendientes</span>
            <strong>{reviews.length - submittedReviews.length}</strong>
          </div>
        </div>
      </section>

      {reviews.length === 0 ? (
        <EmptyState
          description="Cuando completes turnos, tus clientes van a recibir un email pidiendo su calificacion."
          title="Todavia no hay reseñas"
        />
      ) : (
        <div className={styles.reviewList}>
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}
    </section>
  );
}

function ReviewCard({ review }: { review: AppointmentReview }) {
  const pending = review.submittedAt === null;

  return (
    <div className={styles.reviewCard}>
      <div className={styles.reviewCardHeader}>
        <div>
          <strong>{review.customer.name}</strong>
          <p>{review.service.name}</p>
        </div>
        {pending ? (
          <span className={styles.pendingBadge}>Pendiente</span>
        ) : (
          <div className={styles.stars} aria-label={`${review.rating} de 5 estrellas`}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Star fill={value <= (review.rating ?? 0) ? "currentColor" : "none"} key={value} size={16} />
            ))}
          </div>
        )}
      </div>

      {review.comment ? <p className={styles.comment}>&ldquo;{review.comment}&rdquo;</p> : null}

      <p className={styles.meta}>
        {pending
          ? `Solicitada el ${formatDateTime(review.requestedAt)}`
          : `Respondida el ${formatDateTime(review.submittedAt as string)}`}
      </p>
    </div>
  );
}
