/**
 * Açık yönlendirmeyi engeller: yalnız kendi içimizde bir yol kabul edilir.
 * Tarayıcılar sekme/satır sonunu yok sayar ve ters bölüyü bölü sayar; bu
 * yüzden "/\t/evil.test" ya da "/\\evil.test" de "//evil.test" gibi dışarı gider.
 * API'deki safeNext ile aynı kural.
 */
export function safeNext(value: string | null | undefined): string {
  const fallback = "/dashboard";
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const base = "https://app.invalid";
    if (new URL(value, base).origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return value;
}
