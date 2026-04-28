import { describe, expect, it } from "vitest"
import {
  formatCompaniesText,
  formatLinkedInText,
  parseCompaniesText,
  parseLinkedInText,
} from "./text-config"
import type { ScanEntry } from "./index"

describe("parseCompaniesText", () => {
  it("parses 'Name | URL' lines into CompanyConfig entries", () => {
    const out = parseCompaniesText(
      "Stripe | https://boards.greenhouse.io/stripe\nBolt | https://jobs.lever.co/bolt"
    )
    expect(out).toEqual([
      { name: "Stripe", careers_url: "https://boards.greenhouse.io/stripe" },
      { name: "Bolt", careers_url: "https://jobs.lever.co/bolt" },
    ])
  })

  it("trims whitespace around name + URL", () => {
    expect(
      parseCompaniesText("   Stripe   |   https://example.com   ")
    ).toEqual([{ name: "Stripe", careers_url: "https://example.com" }])
  })

  it("treats lines without a pipe as bare names", () => {
    expect(parseCompaniesText("Stripe\nBolt")).toEqual([
      { name: "Stripe" },
      { name: "Bolt" },
    ])
  })

  it("drops blank and whitespace-only lines", () => {
    expect(parseCompaniesText("\n\nStripe\n\n  \nBolt\n")).toEqual([
      { name: "Stripe" },
      { name: "Bolt" },
    ])
  })

  it("falls back to bare-name when URL is empty after a pipe", () => {
    expect(parseCompaniesText("Stripe |")).toEqual([{ name: "Stripe" }])
  })

  it("drops a line with empty name (e.g. '| https://...')", () => {
    expect(parseCompaniesText("| https://example.com")).toEqual([])
  })

  it("returns [] for empty input", () => {
    expect(parseCompaniesText("")).toEqual([])
  })
})

describe("formatCompaniesText", () => {
  it("renders 'Name | URL' for entries that have a URL", () => {
    const entries: ScanEntry[] = [
      { name: "Stripe", careers_url: "https://boards.greenhouse.io/stripe" },
      { name: "Bolt", careers_url: "https://jobs.lever.co/bolt" },
    ]
    expect(formatCompaniesText(entries).text).toBe(
      "Stripe | https://boards.greenhouse.io/stripe\nBolt | https://jobs.lever.co/bolt"
    )
  })

  it("renders bare name when no URL", () => {
    expect(formatCompaniesText([{ name: "Stripe" }]).text).toBe("Stripe")
  })

  it("skips LinkedIn entries and counts them in linkedinHidden", () => {
    const entries: ScanEntry[] = [
      { name: "Stripe", careers_url: "https://example.com" },
      { kind: "linkedin", keywords: "Senior PM", location: "Berlin" },
      { kind: "linkedin", keywords: "Tech Lead", location: "London" },
    ]
    const out = formatCompaniesText(entries)
    expect(out.text).toBe("Stripe | https://example.com")
    expect(out.linkedinHidden).toBe(2)
  })

  it("round-trips through parse → format", () => {
    const text = "Stripe | https://example.com/stripe\nBolt | https://example.com/bolt"
    const parsed = parseCompaniesText(text)
    const formatted = formatCompaniesText(parsed)
    expect(formatted.text).toBe(text)
    expect(formatted.linkedinHidden).toBe(0)
  })
})

describe("parseLinkedInText", () => {
  it("parses keywords | location lines", () => {
    expect(parseLinkedInText("Senior PM | Berlin, Germany")).toEqual([
      { kind: "linkedin", keywords: "Senior PM", location: "Berlin, Germany" },
    ])
  })

  it("captures optional time_range and label", () => {
    expect(
      parseLinkedInText(
        "Senior PM | Berlin, Germany | r604800 | Berlin scanner"
      )
    ).toEqual([
      {
        kind: "linkedin",
        keywords: "Senior PM",
        location: "Berlin, Germany",
        time_range: "r604800",
        label: "Berlin scanner",
      },
    ])
  })

  it("drops lines missing keywords or location", () => {
    expect(parseLinkedInText("\n| Berlin\nSenior PM\n")).toEqual([])
  })

  it("trims whitespace around pipe-separated tokens", () => {
    expect(
      parseLinkedInText("   Senior PM   |   Berlin, Germany   ")
    ).toEqual([
      { kind: "linkedin", keywords: "Senior PM", location: "Berlin, Germany" },
    ])
  })
})

describe("formatLinkedInText", () => {
  it("renders kind:linkedin entries; skips ATS entries", () => {
    const entries: ScanEntry[] = [
      { name: "Stripe", careers_url: "https://example.com" },
      {
        kind: "linkedin",
        keywords: "Senior PM",
        location: "Berlin, Germany",
        time_range: "r604800",
      },
    ]
    expect(formatLinkedInText(entries)).toBe(
      "Senior PM | Berlin, Germany | r604800"
    )
  })

  it("omits time_range when absent", () => {
    const entries: ScanEntry[] = [
      { kind: "linkedin", keywords: "Senior PM", location: "Berlin" },
    ]
    expect(formatLinkedInText(entries)).toBe("Senior PM | Berlin")
  })

  it("round-trips through parse → format", () => {
    const text = "Senior PM | Berlin, Germany | r604800"
    expect(formatLinkedInText(parseLinkedInText(text))).toBe(text)
  })

  it("returns '' when no LinkedIn entries", () => {
    expect(
      formatLinkedInText([{ name: "Stripe", careers_url: "https://x.com" }])
    ).toBe("")
  })
})
