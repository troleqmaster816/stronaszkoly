import crypto from 'node:crypto'

export function createJobsStore({ ttlMs, max }) {
  const jobs = new Map()

  function cleanupJobs(now = Date.now()) {
    for (const [jobId, job] of jobs.entries()) {
      if (!job || typeof job !== 'object') {
        jobs.delete(jobId)
        continue
      }
      if (job.status === 'running' || job.status === 'queued') continue
      const finishedAtMs = job.finishedAt ? Date.parse(job.finishedAt) : Number(job.createdAtMs || 0)
      if (!finishedAtMs) continue
      if ((now - finishedAtMs) > ttlMs) jobs.delete(jobId)
    }
    if (jobs.size <= max) return
    const candidates = Array.from(jobs.values())
      .filter((job) => job && job.status !== 'running' && job.status !== 'queued')
      .sort((a, b) => {
        const at = Date.parse(a.finishedAt || a.startedAt || a.createdAt || '') || Number(a.createdAtMs || 0)
        const bt = Date.parse(b.finishedAt || b.startedAt || b.createdAt || '') || Number(b.createdAtMs || 0)
        return at - bt
      })
    for (const job of candidates) {
      if (jobs.size <= max) break
      jobs.delete(job.id)
    }
  }

  function createJob(base = {}) {
    const createdAt = new Date().toISOString()
    return {
      id: 'job_' + crypto.randomUUID(),
      status: 'queued',
      kind: 'generic',
      createdAt,
      createdAtMs: Date.now(),
      startedAt: null,
      finishedAt: null,
      error: null,
      result: null,
      ...base,
    }
  }

  function getJob(jobId) {
    return jobs.get(jobId)
  }

  function setJob(job) {
    jobs.set(job.id, job)
    cleanupJobs()
    return job
  }

  function findRunning(kind) {
    return Array.from(jobs.values()).find((j) => j && j.kind === kind && j.status === 'running') || null
  }

  function startCleanupInterval() {
    const handle = setInterval(() => cleanupJobs(), Math.max(60_000, Math.floor(ttlMs / 4)))
    handle.unref?.()
    return handle
  }

  return {
    jobs,
    cleanupJobs,
    createJob,
    getJob,
    setJob,
    findRunning,
    startCleanupInterval,
  }
}
