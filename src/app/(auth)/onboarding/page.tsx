"use client"

import { useState, useRef } from "react"
import { Upload, Loader2, Plus, X, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Step = 1 | 2 | 3

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(1)

  // Step 1: CV
  const [cvUploaded, setCvUploaded] = useState(false)
  const [cvUploading, setCvUploading] = useState(false)
  const [cvFileName, setCvFileName] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step 2: Preferences
  const [targetRoles, setTargetRoles] = useState("")
  const [preferences, setPreferences] = useState("")
  const [salaryMin, setSalaryMin] = useState("")
  const [salaryMax, setSalaryMax] = useState("")

  // Step 3: Job URLs
  const [jobUrls, setJobUrls] = useState<string[]>([""])
  const [finishing, setFinishing] = useState(false)

  async function handleCvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setCvUploading(true)
    const formData = new FormData()
    formData.append("file", file)

    try {
      const res = await fetch("/api/cv/upload", {
        method: "POST",
        body: formData,
      })
      if (res.ok) {
        setCvUploaded(true)
        setCvFileName(file.name)
      }
    } catch {
      // handle error silently
    } finally {
      setCvUploading(false)
    }
  }

  function addUrlField() {
    if (jobUrls.length < 3) {
      setJobUrls([...jobUrls, ""])
    }
  }

  function removeUrlField(index: number) {
    setJobUrls(jobUrls.filter((_, i) => i !== index))
  }

  function updateUrl(index: number, value: string) {
    const updated = [...jobUrls]
    updated[index] = value
    setJobUrls(updated)
  }

  const validUrls = jobUrls.filter((u) => u.trim().length > 0)

  async function handleFinish() {
    setFinishing(true)

    try {
      // Save preferences if provided
      if (targetRoles || preferences || salaryMin || salaryMax) {
        await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetRoles: targetRoles
              .split(",")
              .map((r) => r.trim())
              .filter(Boolean),
            preferences,
            salaryMin,
            salaryMax,
          }),
        })
      }

      // Add job URLs
      for (const url of validUrls) {
        await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        })
      }

      // Mark onboarding complete
      await fetch("/api/onboarding/complete", { method: "POST" })

      window.location.href = "/jobs"
    } catch {
      // handle error silently
    } finally {
      setFinishing(false)
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Get Started</CardTitle>
        <CardDescription>
          Step {step} of 3 &mdash;{" "}
          {step === 1
            ? "Upload your CV"
            : step === 2
              ? "Job preferences"
              : "Add example jobs"}
        </CardDescription>
        {/* Progress bar */}
        <div className="flex gap-1.5 mt-4">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {/* Step 1: Upload CV */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload your CV to get started. We will parse it and use it to
              tailor your applications.
            </p>
            <div
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer ${
                cvUploaded
                  ? "border-primary/50 bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const file = e.dataTransfer.files[0]
                if (file && fileInputRef.current) {
                  const dt = new DataTransfer()
                  dt.items.add(file)
                  fileInputRef.current.files = dt.files
                  fileInputRef.current.dispatchEvent(
                    new Event("change", { bubbles: true })
                  )
                }
              }}
            >
              {cvUploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-2" />
              ) : cvUploaded ? (
                <Check className="h-8 w-8 text-primary mb-2" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              )}
              <p className="text-sm font-medium">
                {cvUploading
                  ? "Uploading..."
                  : cvUploaded
                    ? cvFileName
                    : "Drop your CV here or click to upload"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF, DOCX, or TXT
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt,.md"
                className="hidden"
                onChange={handleCvUpload}
              />
            </div>
            <Button
              className="w-full"
              disabled={!cvUploaded}
              onClick={() => setStep(2)}
            >
              Next
            </Button>
          </div>
        )}

        {/* Step 2: Job Preferences */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tell us what you are looking for. This helps us find and evaluate
              the right jobs for you.
            </p>

            <div className="space-y-2">
              <Label htmlFor="targetRoles">Target Roles</Label>
              <Input
                id="targetRoles"
                value={targetRoles}
                onChange={(e) => setTargetRoles(e.target.value)}
                placeholder="Product Manager, Product Ops, Strategy Lead"
              />
              <p className="text-xs text-muted-foreground">Comma-separated</p>
            </div>

            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="salaryMin">Salary Min</Label>
                <Input
                  id="salaryMin"
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value)}
                  placeholder="80000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salaryMax">Salary Max</Label>
                <Input
                  id="salaryMax"
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(e.target.value)}
                  placeholder="120000"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="preferences">Preferences</Label>
              <Textarea
                id="preferences"
                value={preferences}
                onChange={(e) => setPreferences(e.target.value)}
                placeholder="Remote preferred, Berlin or Dubai, no agencies, fintech..."
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(3)}>
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Example Job URLs */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste 1-3 job URLs you are interested in. These help us understand
              what you are looking for and calibrate evaluations.
            </p>

            <div className="space-y-3">
              {jobUrls.map((url, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={url}
                    onChange={(e) => updateUrl(i, e.target.value)}
                    placeholder="https://boards.greenhouse.io/company/jobs/123"
                  />
                  {jobUrls.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeUrlField(i)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {jobUrls.length < 3 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addUrlField}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add another URL
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={validUrls.length === 0 || finishing}
                onClick={handleFinish}
              >
                {finishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Finish Setup
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
