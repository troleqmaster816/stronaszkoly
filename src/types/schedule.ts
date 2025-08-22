// Shared schedule-related TypeScript types

export type RefTables = Record<string, string>;

export type Meta = {
  source?: string;
  scraped_on?: string;
  generation_date_from_page?: string;
};

export type RefObj = { id: string; name: string } | null;

export type Lesson = {
  day: string;
  lesson_num: string;
  time: string;
  subject: string;
  teacher: RefObj;
  group: RefObj;
  room: RefObj;
};

export type Timetables = Record<string, Lesson[]>;

export type DataFile = {
  metadata: Meta;
  teachers: RefTables;
  rooms: RefTables;
  classes: RefTables;
  timetables: Timetables;
};

export type Overrides = {
  subjectOverrides: Record<string, string>;
  teacherNameOverrides: Record<string, string>;
};


