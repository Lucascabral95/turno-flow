import * as Sentry from "@sentry/nestjs";

export function initSentry(dsn: string | undefined): void {
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    tracesSampleRate: 1.0
  });
}
