"use client";

import { CheckCircle2, Star } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { PublicAppointmentReview } from "../../lib/api";
import { requestJson } from "../../lib/api";
import styles from "./submit-review.module.scss";

export function SubmitReview({ token }: { token: string }) {
  const [review, setReview] = useState<PublicAppointmentReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);

    requestJson<PublicAppointmentReview>(`/public/reviews/${token}`)
      .then((loadedReview) => {
        if (!ignore) {
          setReview(loadedReview);
          if (loadedReview.rating) {
            setRating(loadedReview.rating);
          }
          if (loadedReview.comment) {
            setComment(loadedReview.comment);
          }
        }
      })
      .catch((loadError) => {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la reseña");
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (rating < 1) {
      toast.error("Elegi una calificacion antes de enviar");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await requestJson(`/public/reviews/${token}`, {
        body: JSON.stringify({ comment: comment.trim() || undefined, rating }),
        method: "POST"
      });
      setSubmitted(true);
      toast.success("Gracias por tu reseña");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "No se pudo enviar la reseña";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  const alreadySubmitted = Boolean(review?.submittedAt) || submitted;

  return (
    <main className={styles.submitReview}>
      <section className={styles.hero}>
        <span className="page-kicker">Reseña de turno</span>
        <h1>Contanos como te fue</h1>
        <p>Tu opinion ayuda al negocio a mejorar la atencion.</p>
      </section>

      {loading ? <div className="message">Cargando...</div> : null}
      {error && !review ? <div className="error">{error}</div> : null}

      {review ? (
        <section className={`panel stack ${styles.reviewPanel}`}>
          <header className={styles.reviewHeader}>
            <span className="page-kicker">{review.business.name}</span>
            <h2>{review.service.name}</h2>
            <p>con {review.staffMember.name}</p>
          </header>

          {alreadySubmitted ? (
            <div className={styles.successBox}>
              <CheckCircle2 size={18} />
              <span>Ya enviaste tu reseña. ¡Gracias por tu tiempo!</span>
            </div>
          ) : (
            <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
              {error ? <div className="error">{error}</div> : null}

              <div className={styles.starRow} role="radiogroup" aria-label="Calificacion">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    aria-checked={rating === value}
                    aria-label={`${value} estrellas`}
                    className={styles.starButton}
                    key={value}
                    onClick={() => setRating(value)}
                    role="radio"
                    type="button"
                  >
                    <Star fill={value <= rating ? "currentColor" : "none"} size={32} />
                  </button>
                ))}
              </div>

              <label>
                Comentario <span className={styles.optional}>(opcional)</span>
                <textarea
                  maxLength={2000}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Contanos mas sobre tu experiencia"
                  rows={4}
                  value={comment}
                />
              </label>

              <button className="button-primary" disabled={submitting} type="submit">
                {submitting ? "Enviando..." : "Enviar reseña"}
              </button>
            </form>
          )}
        </section>
      ) : null}
    </main>
  );
}
