import { z } from 'zod'
import type {
  DataFile as ScheduleDataFile,
  Lesson as ScheduleLesson,
  Overrides as ScheduleOverrides,
} from '@/types/schedule'

export const RefTables = z.record(z.string())
export const Meta = z.object({
  source: z.string().optional(),
  scraped_on: z.string().optional(),
  generation_date_from_page: z.string().optional(),
})
export const RefObj = z.object({ id: z.string(), name: z.string() }).nullable()
export const Lesson = z.object({
  day: z.string(),
  lesson_num: z.string(),
  time: z.string(),
  subject: z.string(),
  teacher: RefObj,
  group: RefObj,
  room: RefObj,
})
export const Timetables = z.record(z.array(Lesson))
export const DataFileSchema = z.object({
  metadata: Meta,
  teachers: RefTables,
  rooms: RefTables,
  classes: RefTables,
  timetables: Timetables,
})

export const OverridesSchema = z.object({
  subjectOverrides: z.record(z.string()),
  teacherNameOverrides: z.record(z.string()),
})

export type DataFile = ScheduleDataFile
export type Lesson = ScheduleLesson
export type Overrides = ScheduleOverrides

export async function fetchJsonValidated<T>(url: string, schema: z.ZodSchema<T>, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    throw new Error('Invalid schema: ' + parsed.error.message)
  }
  return parsed.data
}
