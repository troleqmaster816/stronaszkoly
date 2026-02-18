/**
 * Minimal TypeScript client for the School Timetable & Attendance API (v1 draft).
 * This file is placed in /public for easy download; you may move it under /src later.
 */

export type Problem = {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  fields?: { path: string; message: string }[];
};

export type Ref = { id: string; name: string };

export type Lesson = {
  day: string;
  lesson_num: string;
  time: string;
  subject: string;
  teacher: Ref | null;
  group: Ref | null;
  room: Ref | null;
};

export type AttendanceEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  dayName?: string;
  slot?: string;
  subjectKey: string;
  subjectLabel: string;
  present: boolean;
  teacherId?: string | null;
  classId?: string | null;
  roomId?: string | null;
};

export type AttendanceSummary = {
  total: number;
  present: number;
  percent: number;
  needToReach50: number;
  canSkipAndKeep50: number;
};

export type AttendanceState = {
  subjects: { key: string; label: string }[];
  plans: Array<{
    id: string;
    name: string;
    days: Record<string, { items: { slotHint?: string; subjectKey: string; subjectLabel: string }[] }>;
  }>;
  byDate: Record<string, Array<{
    id: string;
    date: string;
    dayName?: string;
    slot?: string;
    subjectKey: string;
    subjectLabel: string;
    present: boolean;
    teacherId?: string | null;
    classId?: string | null;
    roomId?: string | null;
  }>>;
  version?: number;
  updatedAt?: number;
};

export type BackupEntry = { filename: string; size: number; mtime: string };
export type ApiResponse<T> = { ok: boolean; data: T };
export type JobExecutionStatus = "queued" | "running" | "succeeded" | "failed" | "timeout";

export class ApiClient {
  readonly baseUrl: string;
  readonly apiKey?: string;

  constructor(opts: { baseUrl?: string; apiKey?: string } = {}) {
    this.baseUrl = (opts.baseUrl ?? "http://localhost:8787").replace(/\/$/, "");
    this.apiKey = opts.apiKey;
  }

  private headers(extra?: Record<string, string>) {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) h["Authorization"] = `Bearer ${this.apiKey}`;
    return { ...h, ...(extra ?? {}) };
  }

  private async handle<T>(res: Response): Promise<T> {
    if (!res.ok) {
      let problem: Problem | undefined;
      try { problem = await res.json(); } catch (error) { void error }
      const err = new Error(problem?.title || `HTTP ${res.status}`) as Error & { problem?: Problem };
      if (problem) err.problem = problem;
      throw err;
    }
    return res.json() as Promise<T>;
  }

  // Users
  getMe() {
    return fetch(`${this.baseUrl}/v1/users/me`, { headers: this.headers() }).then(r => this.handle<ApiResponse<{ authenticated: boolean; user: { id: string; username: string } | null }>>(r));
  }

  // Timetables
  listTeachers() {
    return fetch(`${this.baseUrl}/v1/teachers`, { headers: this.headers() }).then(r => this.handle<ApiResponse<Record<string, string>>>(r));
  }
  listClasses() {
    return fetch(`${this.baseUrl}/v1/classes`, { headers: this.headers() }).then(r => this.handle<ApiResponse<Record<string, string>>>(r));
  }
  listRooms() {
    return fetch(`${this.baseUrl}/v1/rooms`, { headers: this.headers() }).then(r => this.handle<ApiResponse<Record<string, string>>>(r));
  }
  getTeacherTimetable(id: string) {
    return fetch(`${this.baseUrl}/v1/teachers/${encodeURIComponent(id)}/timetable`, { headers: this.headers() }).then(r => this.handle<ApiResponse<{ id: string; lessons: Lesson[] }>>(r));
  }
  getClassTimetable(id: string) {
    return fetch(`${this.baseUrl}/v1/classes/${encodeURIComponent(id)}/timetable`, { headers: this.headers() }).then(r => this.handle<ApiResponse<{ id: string; lessons: Lesson[] }>>(r));
  }
  getRoomTimetable(id: string) {
    return fetch(`${this.baseUrl}/v1/rooms/${encodeURIComponent(id)}/timetable`, { headers: this.headers() }).then(r => this.handle<ApiResponse<{ id: string; lessons: Lesson[] }>>(r));
  }

  // Attendance
  getAttendance() {
    return fetch(`${this.baseUrl}/v1/attendance`, { headers: this.headers() }).then(r => this.handle<ApiResponse<AttendanceState>>(r));
  }
  putAttendance(state: AttendanceState) {
    return fetch(`${this.baseUrl}/v1/attendance`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(state),
    }).then(r => this.handle<ApiResponse<{ saved: boolean }>>(r));
  }
  getAttendanceEntries(params: { from?: string; to?: string; subjectKey?: string; classId?: string; teacherId?: string; limit?: number; cursor?: string } = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) q.set(k, String(v));
    const url = `${this.baseUrl}/v1/attendance/entries${q.toString() ? "?" + q.toString() : ""}`;
    return fetch(url, { headers: this.headers() }).then(r => this.handle<ApiResponse<{ entries: AttendanceEntry[]; nextCursor?: string | null }>>(r));
  }

  patchAttendanceEntries(updates: { id: string; present: boolean; ifMatch?: string }[], idempotencyKey?: string) {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return fetch(`${this.baseUrl}/v1/attendance/entries`, {
      method: "PATCH",
      headers: this.headers(headers),
      body: JSON.stringify({ updates }),
    }).then(r => this.handle<ApiResponse<{ updated: number }>>(r));
  }

  getAttendanceSummary(params: { from?: string; to?: string; subjectKey?: string } = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) q.set(k, String(v));
    const url = `${this.baseUrl}/v1/attendance/summary${q.toString() ? "?" + q.toString() : ""}`;
    return fetch(url, { headers: this.headers() }).then(r => this.handle<ApiResponse<AttendanceSummary>>(r));
  }

  setDayPresent(dateISO: string, present: boolean) {
    return fetch(`${this.baseUrl}/v1/attendance/days/${encodeURIComponent(dateISO)}/present`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ present }),
    }).then(r => this.handle<ApiResponse<{ updated: number }>>(r));
  }

  getPlans() {
    return fetch(`${this.baseUrl}/v1/attendance/plans`, { headers: this.headers() }).then(r => this.handle<ApiResponse<AttendanceState["plans"]>>(r));
  }
  applyPlan(dateISO: string, body: { planId: string; overwrite?: boolean; setPresent?: boolean }) {
    return fetch(`${this.baseUrl}/v1/attendance/days/${encodeURIComponent(dateISO)}/apply-plan`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    }).then(r => this.handle<ApiResponse<{ created: number; overwritten: boolean }>>(r));
  }

  // Approvals
  createApproval(body: { action: "toggle" | "set"; dateISO: string; entryId: string; present?: boolean }) {
    return fetch(`${this.baseUrl}/v1/approvals`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    }).then(r => this.handle<ApiResponse<{ token: string; url: string; expiresAt: string }>>(r));
  }
  getApproval(token: string) {
    return fetch(`${this.baseUrl}/v1/approvals/${encodeURIComponent(token)}`, { headers: this.headers() }).then(r => this.handle<ApiResponse<unknown>>(r));
  }
  decideApproval(token: string, decision: "accept" | "deny") {
    return fetch(`${this.baseUrl}/v1/approvals/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ decision }),
    }).then(r => this.handle<ApiResponse<{ status: string }>>(r));
  }

  // Overrides
  getOverrides() {
    return fetch(`${this.baseUrl}/v1/overrides`, { headers: this.headers() }).then(r => this.handle<ApiResponse<{ subjectOverrides: Record<string, string>; teacherNameOverrides: Record<string, string> }>>(r));
  }
  putOverrides(data: { subjectOverrides: Record<string, string>; teacherNameOverrides: Record<string, string> }) {
    return fetch(`${this.baseUrl}/v1/overrides`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(data)
    }).then(r => this.handle<ApiResponse<{ saved: boolean }>>(r));
  }

  // Jobs
  startTimetableScrape() {
    return fetch(`${this.baseUrl}/v1/jobs/timetable-scrape`, { method: "POST", headers: this.headers() }).then(r => this.handle<ApiResponse<{ jobId: string; statusUrl: string; status: JobExecutionStatus }>>(r));
  }
  startArticlesScrape() {
    return fetch(`${this.baseUrl}/v1/jobs/articles-scrape`, { method: "POST", headers: this.headers() }).then(r => this.handle<ApiResponse<{ jobId: string; statusUrl: string; status: JobExecutionStatus }>>(r));
  }
  getJob(jobId: string) {
    return fetch(`${this.baseUrl}/v1/jobs/${encodeURIComponent(jobId)}`, { headers: this.headers() }).then(r => this.handle<ApiResponse<{ id: string; status: JobExecutionStatus }>>(r));
  }

  // Timetable maintenance
  refreshTimetableSync() {
    return fetch(`${this.baseUrl}/v1/refresh`, { method: "POST", headers: this.headers() }).then(r => this.handle<ApiResponse<Record<string, unknown>>>(r));
  }
  listBackups() {
    return fetch(`${this.baseUrl}/v1/timetable/backups`, { headers: this.headers() }).then(r => this.handle<ApiResponse<BackupEntry[]>>(r));
  }
  restoreBackup(filename: string) {
    return fetch(`${this.baseUrl}/v1/timetable/restore`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ filename }),
    }).then(r => this.handle<ApiResponse<{ restored: boolean }>>(r));
  }
}
