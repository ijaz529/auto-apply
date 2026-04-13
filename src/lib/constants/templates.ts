import type { TemplateDefinition } from "@/types"

export const TEMPLATE_REGISTRY: TemplateDefinition[] = [
  {
    slug: "basic-resume",
    name: "Basic Resume",
    type: "typst-package",
    package: "basic-resume",
    author: "Stephen Xu",
    creditRequired: true,
    previewUrl: "/templates/basic-resume-preview.png",
  },
  {
    slug: "attractive-resume",
    name: "Attractive Resume",
    type: "typst-package",
    package: "attractive-resume",
    author: "Harkunwar Kochar",
    creditRequired: true,
    previewUrl: "/templates/attractive-resume-preview.png",
  },
  {
    slug: "keep-original",
    name: "Keep Original",
    type: "passthrough",
    author: "You",
    creditRequired: false,
  },
  {
    slug: "browse-more",
    name: "Browse More Templates",
    type: "external",
    author: "Typst Community",
    creditRequired: false,
    externalUrl: "https://typst.app/universe/search/?kind=templates&q=resume",
  },
]
