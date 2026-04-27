"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Save,
  Upload,
  Pencil,
  RefreshCw,
  Check,
  ExternalLink,
  Mail,
  Loader2,
  Eye,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { TEMPLATE_REGISTRY } from "@/lib/constants/templates"

interface ProfileData {
  fullName: string
  email: string
  phone: string
  location: string
  linkedin: string
  github: string
  portfolioUrl: string
  visaStatus: string
  targetRoles: string
  salaryMin: string
  salaryMax: string
  preferences: string
}

const emptyProfile: ProfileData = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
  github: "",
  portfolioUrl: "",
  visaStatus: "",
  targetRoles: "",
  salaryMin: "",
  salaryMax: "",
  preferences: "",
}

export default function SettingsPage() {
  // Profile state
  const [profile, setProfile] = useState<ProfileData>(emptyProfile)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)

  // CV state
  const [cvMarkdown, setCvMarkdown] = useState("")
  const [cvLoading, setCvLoading] = useState(true)
  const [cvEditing, setCvEditing] = useState(false)
  const [cvUploading, setCvUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Template state
  const [selectedTemplate, setSelectedTemplate] = useState("basic-resume")
  const [templateSaving, setTemplateSaving] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile")
      if (res.ok) {
        const data = await res.json()
        setProfile({
          fullName: data.fullName ?? "",
          email: data.email ?? "",
          phone: data.phone ?? "",
          location: data.location ?? "",
          linkedin: data.linkedin ?? "",
          github: data.github ?? "",
          portfolioUrl: data.portfolioUrl ?? "",
          visaStatus: data.visaStatus ?? "",
          targetRoles: Array.isArray(data.targetRoles)
            ? data.targetRoles.join(", ")
            : data.targetRoles ?? "",
          salaryMin: data.salaryMin ?? "",
          salaryMax: data.salaryMax ?? "",
          preferences: data.preferences ?? "",
        })
        if (data.selectedTemplate) {
          setSelectedTemplate(data.selectedTemplate)
        }
      }
    } catch {
      // silently fail
    } finally {
      setProfileLoading(false)
    }
  }, [])

  const fetchCv = useCallback(async () => {
    try {
      const res = await fetch("/api/cv")
      if (res.ok) {
        const data = await res.json()
        setCvMarkdown(data.markdown ?? "")
      }
    } catch {
      // silently fail
    } finally {
      setCvLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProfile()
    fetchCv()
  }, [fetchProfile, fetchCv])

  async function handleProfileSave() {
    setProfileSaving(true)
    setProfileSaved(false)
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          targetRoles: profile.targetRoles
            .split(",")
            .map((r) => r.trim())
            .filter(Boolean),
        }),
      })
      if (res.ok) {
        setProfileSaved(true)
        setTimeout(() => setProfileSaved(false), 3000)
      }
    } catch {
      // handle error
    } finally {
      setProfileSaving(false)
    }
  }

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
        const data = await res.json()
        setCvMarkdown(data.markdown ?? "")
        setCvEditing(false)
        // Show brief success indicator
        setProfileSaved(true)
        setTimeout(() => setProfileSaved(false), 3000)
      }
    } catch {
      // handle error
    } finally {
      setCvUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  async function handleCvSave() {
    try {
      await fetch("/api/cv", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: cvMarkdown }),
      })
      setCvEditing(false)
    } catch {
      // handle error
    }
  }

  async function handleTemplateSelect(slug: string) {
    const template = TEMPLATE_REGISTRY.find((t) => t.slug === slug)
    if (template?.type === "external" && template.externalUrl) {
      window.open(template.externalUrl, "_blank")
      return
    }

    setSelectedTemplate(slug)
    setTemplateSaving(true)
    try {
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedTemplate: slug }),
      })
    } catch {
      // handle error
    } finally {
      setTemplateSaving(false)
    }
  }

  async function handlePreview() {
    setPreviewLoading(true)
    try {
      const res = await fetch("/api/cv/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: selectedTemplate }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        window.open(url, "_blank")
      }
    } catch {
      // handle error
    } finally {
      setPreviewLoading(false)
    }
  }

  function updateProfile(field: keyof ProfileData, value: string) {
    setProfile((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-1">
          Manage your profile, CV, templates, and preferences.
        </p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="cv">CV</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile Settings</CardTitle>
              <CardDescription>
                Configure your personal info, target roles, and preferences.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profileLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full Name</Label>
                      <Input
                        id="fullName"
                        value={profile.fullName}
                        onChange={(e) =>
                          updateProfile("fullName", e.target.value)
                        }
                        placeholder="Jane Doe"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={profile.email}
                        onChange={(e) =>
                          updateProfile("email", e.target.value)
                        }
                        placeholder="jane@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={profile.phone}
                        onChange={(e) =>
                          updateProfile("phone", e.target.value)
                        }
                        placeholder="+49 123 456 7890"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="location">Location</Label>
                      <Input
                        id="location"
                        value={profile.location}
                        onChange={(e) =>
                          updateProfile("location", e.target.value)
                        }
                        placeholder="Berlin, Germany"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="linkedin">LinkedIn</Label>
                      <Input
                        id="linkedin"
                        value={profile.linkedin}
                        onChange={(e) =>
                          updateProfile("linkedin", e.target.value)
                        }
                        placeholder="https://linkedin.com/in/janedoe"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="github">GitHub</Label>
                      <Input
                        id="github"
                        value={profile.github}
                        onChange={(e) =>
                          updateProfile("github", e.target.value)
                        }
                        placeholder="https://github.com/janedoe"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="portfolioUrl">Portfolio URL</Label>
                      <Input
                        id="portfolioUrl"
                        value={profile.portfolioUrl}
                        onChange={(e) =>
                          updateProfile("portfolioUrl", e.target.value)
                        }
                        placeholder="https://janedoe.dev"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="visaStatus">Visa Status</Label>
                      <Input
                        id="visaStatus"
                        value={profile.visaStatus}
                        onChange={(e) =>
                          updateProfile("visaStatus", e.target.value)
                        }
                        placeholder="EU citizen, Work permit, etc."
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="targetRoles">Target Roles</Label>
                    <Input
                      id="targetRoles"
                      value={profile.targetRoles}
                      onChange={(e) =>
                        updateProfile("targetRoles", e.target.value)
                      }
                      placeholder="Product Manager, Product Ops, Strategy Lead (comma-separated)"
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma-separated list of roles you are targeting. New evaluations use these to calibrate North Star alignment — on-target roles score higher, off-target roles get an honest mismatch note.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="salaryMin">Salary Min</Label>
                      <Input
                        id="salaryMin"
                        value={profile.salaryMin}
                        onChange={(e) =>
                          updateProfile("salaryMin", e.target.value)
                        }
                        placeholder="80000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="salaryMax">Salary Max</Label>
                      <Input
                        id="salaryMax"
                        value={profile.salaryMax}
                        onChange={(e) =>
                          updateProfile("salaryMax", e.target.value)
                        }
                        placeholder="120000"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="preferences">Preferences</Label>
                    <Textarea
                      id="preferences"
                      value={profile.preferences}
                      onChange={(e) =>
                        updateProfile("preferences", e.target.value)
                      }
                      placeholder="Remote preferred, no agencies, Berlin or Dubai, etc."
                      rows={3}
                    />
                  </div>

                  <Button
                    onClick={handleProfileSave}
                    disabled={profileSaving}
                  >
                    {profileSaving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : profileSaved ? (
                      <Check className="mr-2 h-4 w-4" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {profileSaved ? "Saved" : "Save Profile"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CV Tab */}
        <TabsContent value="cv" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>CV Management</CardTitle>
              <CardDescription>
                Upload your CV or edit it directly. Supports PDF, DOCX, and
                plain text.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {cvLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Upload Area */}
                  <div
                    className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 transition-colors hover:border-muted-foreground/50 cursor-pointer"
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
                    ) : (
                      <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    )}
                    <p className="text-sm font-medium">
                      {cvUploading
                        ? "Uploading..."
                        : cvMarkdown
                          ? "Re-upload CV"
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

                  {/* CV Content */}
                  {cvMarkdown && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Label>Your CV</Label>
                          <span className="text-xs text-green-600 bg-green-50 dark:bg-green-950 px-2 py-0.5 rounded">
                            <Check className="inline h-3 w-3 mr-1" />
                            Saved
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {cvEditing ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setCvEditing(false)
                                  fetchCv()
                                }}
                              >
                                Cancel
                              </Button>
                              <Button size="sm" onClick={handleCvSave}>
                                <Save className="mr-1 h-3 w-3" />
                                Save Changes
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCvEditing(true)}
                            >
                              <Pencil className="mr-1 h-3 w-3" />
                              Edit
                            </Button>
                          )}
                        </div>
                      </div>
                      <Textarea
                        value={cvMarkdown}
                        onChange={(e) => setCvMarkdown(e.target.value)}
                        readOnly={!cvEditing}
                        rows={20}
                        className={`font-mono text-xs ${!cvEditing ? "bg-muted/50" : ""}`}
                      />
                      <p className="text-xs text-muted-foreground">
                        Your CV is automatically saved when uploaded. Click Edit to make manual changes.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>CV Templates</CardTitle>
              <CardDescription>
                Choose a template for your generated CVs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {TEMPLATE_REGISTRY.map((template) => {
                  const isSelected = selectedTemplate === template.slug
                  const isExternal = template.type === "external"

                  return (
                    <div
                      key={template.slug}
                      className={`relative rounded-lg border-2 p-4 cursor-pointer transition-all ${
                        isSelected && !isExternal
                          ? "border-primary bg-primary/5"
                          : "border-muted hover:border-muted-foreground/50"
                      }`}
                      onClick={() => handleTemplateSelect(template.slug)}
                    >
                      {isSelected && !isExternal && (
                        <div className="absolute top-2 right-2">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      )}

                      {template.previewUrl ? (
                        <div className="aspect-[3/4] rounded bg-muted mb-3 flex items-center justify-center overflow-hidden">
                          <img
                            src={template.previewUrl}
                            alt={template.name}
                            className="object-cover w-full h-full"
                          />
                        </div>
                      ) : (
                        <div className="aspect-[3/4] rounded bg-muted mb-3 flex items-center justify-center">
                          {isExternal ? (
                            <ExternalLink className="h-8 w-8 text-muted-foreground" />
                          ) : (
                            <RefreshCw className="h-8 w-8 text-muted-foreground" />
                          )}
                        </div>
                      )}

                      <h3 className="font-medium text-sm">{template.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        by {template.author}
                      </p>
                      {template.slug === "basic-resume" && (
                        <span className="mt-1 inline-block text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5">
                          Default
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  onClick={handlePreview}
                  disabled={previewLoading || templateSaving}
                >
                  {previewLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className="mr-2 h-4 w-4" />
                  )}
                  Preview
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Tab */}
        <TabsContent value="email" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Email Integration</CardTitle>
              <CardDescription>
                Connect your email to automatically track application
                responses and update statuses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Mail className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium">Connect Gmail</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mb-6">
                  When connected, the system will monitor your inbox for
                  application responses, interview invitations, and status
                  updates -- and automatically update your tracker.
                </p>
                <Button disabled variant="outline">
                  <Mail className="mr-2 h-4 w-4" />
                  Connect Gmail -- Coming Soon
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
