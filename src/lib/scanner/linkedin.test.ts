import { describe, expect, it } from "vitest"
import { decodeHtml, parseLinkedIn } from "./linkedin"

describe("decodeHtml", () => {
  it("decodes the common HTML entities", () => {
    expect(decodeHtml("Tom &amp; Jerry &lt;3 &quot;hi&quot; it&#39;s")).toBe(
      `Tom & Jerry <3 "hi" it's`
    )
    expect(decodeHtml("a&nbsp;b")).toBe("a b")
  })
})

describe("parseLinkedIn", () => {
  // Trimmed-down sample modelled on the real jobs-guest HTML fragment.
  const SAMPLE = `
    <li>
      <div>
        <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/senior-pm-at-acme-12345?refId=abc&amp;trackingId=xyz">link</a>
        <h3 class="base-search-card__title">Senior Product Manager</h3>
        <h4 class="base-search-card__subtitle">
          <a href="/company/acme">Acme Corp</a>
        </h4>
        <span class="job-search-card__location">Berlin, Germany</span>
      </div>
    </li>
    <li>
      <div>
        <a class="base-card__full-link foo" href="https://www.linkedin.com/jobs/view/staff-eng-67890">link</a>
        <h3 class="base-search-card__title">Staff Engineer &amp; Tech Lead</h3>
        <h4 class="base-search-card__subtitle">
          <a href="/company/widgets">Widgets &amp; Co.</a>
        </h4>
        <span class="job-search-card__location">Remote</span>
      </div>
    </li>
    <li>
      <div>
        <h3 class="base-search-card__title">Card Without URL — Skipped</h3>
      </div>
    </li>
  `

  it("extracts title, company, location, and a clean URL", () => {
    const cards = parseLinkedIn(SAMPLE)
    expect(cards).toHaveLength(2)
    expect(cards[0]).toEqual({
      title: "Senior Product Manager",
      url: "https://www.linkedin.com/jobs/view/senior-pm-at-acme-12345",
      company: "Acme Corp",
      location: "Berlin, Germany",
    })
  })

  it("strips query strings and decodes HTML entities", () => {
    const cards = parseLinkedIn(SAMPLE)
    expect(cards[0].url).not.toContain("?")
    expect(cards[1].title).toBe("Staff Engineer & Tech Lead")
    expect(cards[1].company).toBe("Widgets & Co.")
  })

  it("skips cards missing a URL or title", () => {
    const cards = parseLinkedIn(SAMPLE)
    expect(cards.find((c) => c.title.includes("Skipped"))).toBeUndefined()
  })

  it("returns [] on empty / malformed input", () => {
    expect(parseLinkedIn("")).toEqual([])
    expect(parseLinkedIn("<div>no li tags here</div>")).toEqual([])
  })
})
