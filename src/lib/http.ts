export async function readErrorMessage(
  res: Response,
  fallback = "Operacja nie powiodła się"
): Promise<string> {
  try {
    const body = await res.clone().json()
    if (body && typeof body === "object") {
      const detail = (body as { detail?: unknown }).detail
      if (typeof detail === "string" && detail.trim()) return detail
      const error = (body as { error?: unknown }).error
      if (typeof error === "string" && error.trim()) return error
      const title = (body as { title?: unknown }).title
      if (typeof title === "string" && title.trim()) return title
      const message = (body as { message?: unknown }).message
      if (typeof message === "string" && message.trim()) return message
    }
  } catch {
    // ignore json parse errors
  }

  try {
    const text = (await res.text()).trim()
    if (text) return text
  } catch {
    // ignore text parse errors
  }
  return fallback
}
