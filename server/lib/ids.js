import crypto from 'node:crypto'

export function uid(prefix = 'id_') {
  return prefix + crypto.randomUUID()
}
