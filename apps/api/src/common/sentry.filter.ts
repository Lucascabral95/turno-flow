import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import * as Sentry from "@sentry/nestjs";

@Catch()
export class SentryFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    void host;
    Sentry.captureException(exception);
  }
}
