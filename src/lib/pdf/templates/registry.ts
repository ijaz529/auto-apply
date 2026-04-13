import type { CVData, TemplateDefinition } from "@/types"
import { renderBasicResume } from "./basic-resume"
import { renderAttractiveResume } from "./attractive-resume"

type TemplateRenderer = (cv: CVData, keywords?: string[]) => string

const renderers: Record<string, TemplateRenderer> = {
  "basic-resume": renderBasicResume,
  "attractive-resume": renderAttractiveResume,
}

export const TEMPLATE_REGISTRY: TemplateDefinition[] = [
  {
    slug: "basic-resume",
    name: "Basic Resume",
    type: "typst-package",
    package: "@preview/basic-resume:0.2.9",
    author: "stuxf",
    creditRequired: false,
    previewUrl: "https://typst.app/universe/package/basic-resume",
  },
  {
    slug: "attractive-resume",
    name: "Attractive Resume",
    type: "typst-repo",
    repo: "Harkunwar/attractive-typst-resume",
    author: "Harkunwar",
    creditRequired: true,
    previewUrl:
      "https://github.com/Harkunwar/attractive-typst-resume",
  },
]

/**
 * Render a .typ file for the given template slug and CV data.
 * Returns the Typst source string ready for compilation.
 */
export function renderTemplate(
  slug: string,
  cvData: CVData,
  keywords?: string[]
): string {
  const renderer = renderers[slug]
  if (!renderer) {
    throw new Error(
      `Unknown template slug: "${slug}". Available: ${Object.keys(renderers).join(", ")}`
    )
  }
  return renderer(cvData, keywords)
}

/**
 * List all available template definitions.
 */
export function listTemplates(): TemplateDefinition[] {
  return TEMPLATE_REGISTRY
}
