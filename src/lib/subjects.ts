export function normalizeSubjectKeyCanonical(subject?: string | null): string {
  const base = String(subject || '')
    .toLowerCase()
    .trim()
    .replace(/(?:\s|-)*(\d+\/\d+)(?=$|\b)/gi, '')
    .replace(/[\s-]+$/g, '')
    .replace(/\s{2,}/g, ' ')

  if (base === 'r_matematyka') return 'matematyka'
  return base
}
