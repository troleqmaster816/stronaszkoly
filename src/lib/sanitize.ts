import DOMPurify from 'dompurify'

function hardenLinksAndEmbeds(root: HTMLElement) {
  root.querySelectorAll('a[href]').forEach((node) => {
    const href = node.getAttribute('href') || ''
    if (/^\s*javascript:/i.test(href)) node.removeAttribute('href')
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noreferrer noopener')
  })

  root.querySelectorAll('iframe').forEach((node) => {
    const src = node.getAttribute('src') || ''
    if (!/^https?:\/\//i.test(src)) {
      node.remove()
      return
    }
    node.setAttribute('loading', 'lazy')
    node.setAttribute('referrerpolicy', 'no-referrer')
    if (!node.getAttribute('style')) node.setAttribute('style', 'border:1px solid #ddd; width:100%;')
  })
}

export function sanitizeArticleHtml(html?: string): string {
  if (!html) return ''
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['target', 'rel', 'loading', 'referrerpolicy', 'allow', 'allowfullscreen', 'style'],
  })
  if (typeof window === 'undefined') return clean
  const container = document.createElement('div')
  container.innerHTML = clean
  hardenLinksAndEmbeds(container)
  return container.innerHTML
}

export function sanitizeStatutHtml(html?: string): string {
  if (!html) return ''
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  })
  if (typeof window === 'undefined') return clean
  const container = document.createElement('div')
  container.innerHTML = clean
  hardenLinksAndEmbeds(container)
  return container.innerHTML
}
