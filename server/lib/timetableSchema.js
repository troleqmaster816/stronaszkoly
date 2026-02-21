import { z } from 'zod'

const RefTables = z.record(z.string())
const Meta = z.object({
  source: z.string().optional(),
  scraped_on: z.string().optional(),
  generation_date_from_page: z.string().optional(),
}).optional().default({})
const RefObj = z.object({ id: z.string(), name: z.string() }).nullable()
const Lesson = z.object({
  day: z.string(),
  lesson_num: z.string(),
  time: z.string(),
  subject: z.string(),
  teacher: RefObj,
  group: RefObj,
  room: RefObj,
})
const Timetables = z.record(z.array(Lesson))

export const TimetableDataSchema = z.object({
  metadata: Meta,
  teachers: RefTables,
  rooms: RefTables,
  classes: RefTables,
  timetables: Timetables,
})

export function validateTimetableData(payload) {
  const parsed = TimetableDataSchema.safeParse(payload)
  if (parsed.success) return { ok: true, data: parsed.data }
  return { ok: false, error: parsed.error }
}
