export function formString(formData: FormData, key: string, fallback = ""): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : fallback;
}

export function formNumber(formData: FormData, key: string, fallback = 0): number {
  const value = formString(formData, key);
  return value === "" ? fallback : Number(value);
}
