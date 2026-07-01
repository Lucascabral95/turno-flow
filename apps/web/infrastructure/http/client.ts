export function publicApiUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  return `${baseUrl}${path}`;
}

export async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(publicApiUrl(path), {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers ?? {})
    }
  });
  const responseText = await response.text();
  const body = parseJsonBody(responseText);

  if (!response.ok) {
    throw new Error(errorMessageFromBody(body) ?? `Request failed with status ${response.status}`);
  }

  return body as T;
}

function parseJsonBody(value: string): unknown {
  if (value.trim() === "") {
    return null;
  }

  return JSON.parse(value);
}

function errorMessageFromBody(value: unknown): string | undefined {
  if (!hasMessage(value)) {
    return undefined;
  }

  const { message } = value;
  return typeof message === "string" ? message : undefined;
}

function hasMessage(value: unknown): value is { message: unknown } {
  return typeof value === "object" && value !== null && "message" in value;
}
