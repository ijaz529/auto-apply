export interface CVData {
  fullName: string
  location: string
  email: string
  phone?: string
  linkedin?: string
  github?: string
  portfolioUrl?: string
  summary: string
  experience: WorkEntry[]
  education: EduEntry[]
  projects: ProjectEntry[]
  certifications: CertEntry[]
  skills: SkillCategory[]
  achievements?: string[]
}

export interface WorkEntry {
  title: string
  company: string
  location: string
  startDate: string
  endDate: string
  bullets: string[]
}

export interface EduEntry {
  institution: string
  location: string
  degree: string
  endDate: string
}

export interface ProjectEntry {
  name: string
  role?: string
  startDate: string
  endDate: string
  url?: string
  bullets: string[]
}

export interface CertEntry {
  name: string
  issuer: string
  code?: string
}

export interface SkillCategory {
  category: string
  items: string[]
}

export type ApplicationStatus =
  | "evaluated"
  | "applied"
  | "responded"
  | "interview"
  | "offer"
  | "rejected"
  | "discarded"
  | "skip"

export interface TemplateDefinition {
  slug: string
  name: string
  type: "typst-package" | "typst-repo" | "passthrough" | "external"
  package?: string
  repo?: string
  author: string
  creditRequired: boolean
  previewUrl?: string
  externalUrl?: string
}
