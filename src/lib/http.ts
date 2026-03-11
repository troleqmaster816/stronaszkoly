const HUB_BACKGROUND_MAX_UPLOAD_MB = 40

function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export async function readErrorMessage(
  res: Response,
  fallback = "Operacja nie powiodła się"
): Promise<string> {
  if (res.status === 413) {
    return `Plik jest za duży. Maksymalny rozmiar to ${HUB_BACKGROUND_MAX_UPLOAD_MB} MB.`
  }

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
    if (!text) return fallback
    if (/<html[\s>]/i.test(text) || /<!doctype html/i.test(text)) {
      const extracted = extractTextFromHtml(text)
      return extracted || fallback
    }
    return text
  } catch {
    // ignore text parse errors
  }
  return fallback
}
