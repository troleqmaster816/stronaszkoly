export type DocumentVariant = {
  label: string
  url: string
  format: string
}

export type DocumentAttachment = {
  title: string
  variants: DocumentVariant[]
}

export type DocumentAttachmentGroup = {
  label: string
  items: DocumentAttachment[]
}

export type Document = {
  title: string
  url: string
  format: string
  category: string
  variants?: DocumentVariant[]
  attachmentGroups?: DocumentAttachmentGroup[]
}

export type TeachingPlanSchoolYear = {
  start: number | null
  end: number | null
  label: string | null
  inferredFrom: 'pdf-header' | 'upload-url' | 'fallback'
}

export type TeachingPlanDocument = {
  classNum: number
  url: string
  title: string
  schoolYear?: TeachingPlanSchoolYear | null
  parseError?: boolean
}

export type TeachingPlanProfile = {
  name: string
  code: string
  classes: TeachingPlanDocument[]
}

export type DocumentsData = {
  scrapedAt: string
  sourceUrl: string
  categoryLabels: Record<string, string>
  documents: Document[]
  teachingPlans: Record<string, TeachingPlanProfile>
}
