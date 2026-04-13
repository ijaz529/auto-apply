"use client"

import { useState, useEffect, useCallback } from "react"
import {
  GraduationCap,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Sparkles,
  Copy,
  Check,
  Users,
  AlertTriangle,
  MessageSquare,
  BookOpen,
  Layers,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { MarkdownRenderer } from "@/components/markdown-renderer"

interface Story {
  id: string
  category: string
  title: string
  situation: string
  task: string
  action: string
  result: string
  reflection: string
}

interface EvaluatedJob {
  id: string
  company: string
  role: string
}

interface PrepData {
  overview: string
  rounds: string
  questions: string
  stories: string
  redFlags: string
}

interface OutreachData {
  connectionRequest: string
  inMail: string
  contacts: { name: string; title: string; linkedinUrl: string }[]
}

const CATEGORIES = [
  "Leadership",
  "Technical",
  "Conflict Resolution",
  "Innovation",
  "Teamwork",
  "Problem Solving",
  "Communication",
  "Adaptability",
  "Customer Focus",
  "Other",
]

const emptyStory = {
  category: "",
  title: "",
  situation: "",
  task: "",
  action: "",
  result: "",
  reflection: "",
}

export default function InterviewPrepPage() {
  const [stories, setStories] = useState<Story[]>([])
  const [evaluatedJobs, setEvaluatedJobs] = useState<EvaluatedJob[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyStory)
  const [saving, setSaving] = useState(false)

  // Prep generation state
  const [selectedJobId, setSelectedJobId] = useState("")
  const [generatingPrep, setGeneratingPrep] = useState(false)
  const [prepData, setPrepData] = useState<PrepData | null>(null)
  const [prepError, setPrepError] = useState<string | null>(null)

  // Outreach state
  const [generatingOutreach, setGeneratingOutreach] = useState(false)
  const [outreachData, setOutreachData] = useState<OutreachData | null>(null)
  const [outreachError, setOutreachError] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const fetchStories = useCallback(async () => {
    try {
      const res = await fetch("/api/interview-prep/stories")
      if (res.ok) {
        const data = await res.json()
        setStories(data.stories ?? [])
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs?limit=100")
      if (res.ok) {
        const data = await res.json()
        const jobs = (data.jobs ?? [])
          .filter((j: { evaluation?: unknown }) => j.evaluation)
          .map((j: { id: string; company: string; role: string }) => ({
            id: j.id,
            company: j.company,
            role: j.role,
          }))
        setEvaluatedJobs(jobs)
      }
    } catch {
      // silently fail
    }
  }, [])

  useEffect(() => {
    fetchStories()
    fetchJobs()
  }, [fetchStories, fetchJobs])

  function openNewDialog() {
    setEditingId(null)
    setForm(emptyStory)
    setDialogOpen(true)
  }

  function openEditDialog(story: Story) {
    setEditingId(story.id)
    setForm({
      category: story.category,
      title: story.title,
      situation: story.situation,
      task: story.task,
      action: story.action,
      result: story.result,
      reflection: story.reflection,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.title || !form.category) return

    setSaving(true)
    try {
      const url = editingId
        ? `/api/interview-prep/stories/${editingId}`
        : "/api/interview-prep/stories"
      const method = editingId ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      if (res.ok) {
        setDialogOpen(false)
        setForm(emptyStory)
        setEditingId(null)
        await fetchStories()
      }
    } catch {
      // handle error
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(storyId: string) {
    try {
      const res = await fetch(`/api/interview-prep/stories/${storyId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setStories((prev) => prev.filter((s) => s.id !== storyId))
      }
    } catch {
      // handle error
    }
  }

  async function handleGeneratePrep() {
    if (!selectedJobId) return

    setGeneratingPrep(true)
    setPrepError(null)
    setPrepData(null)

    try {
      const res = await fetch(`/api/interview-prep/${selectedJobId}`, {
        method: "POST",
      })
      if (res.ok) {
        const data = await res.json()
        setPrepData({
          overview: data.overview ?? "",
          rounds: data.rounds ?? "",
          questions: data.questions ?? "",
          stories: data.stories ?? "",
          redFlags: data.redFlags ?? "",
        })
        await fetchStories()
      } else {
        const err = await res.json().catch(() => ({ error: "Generation failed" }))
        setPrepError(err.error ?? "Failed to generate prep. Try again.")
      }
    } catch {
      setPrepError("Network error. Check your connection.")
    } finally {
      setGeneratingPrep(false)
    }
  }

  async function handleGenerateOutreach() {
    if (!selectedJobId) return

    setGeneratingOutreach(true)
    setOutreachError(null)
    setOutreachData(null)

    try {
      const res = await fetch(`/api/outreach/${selectedJobId}`, {
        method: "POST",
      })
      if (res.ok) {
        const data = await res.json()
        setOutreachData({
          connectionRequest: data.connectionRequest ?? "",
          inMail: data.inMail ?? "",
          contacts: data.contacts ?? [],
        })
      } else {
        const err = await res.json().catch(() => ({ error: "Outreach generation failed" }))
        setOutreachError(err.error ?? "Failed to generate outreach. Try again.")
      }
    } catch {
      setOutreachError("Network error. Check your connection.")
    } finally {
      setGeneratingOutreach(false)
    }
  }

  async function copyToClipboard(text: string, field: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      // fallback
    }
  }

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const selectedJob = evaluatedJobs.find((j) => j.id === selectedJobId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Interview Prep
          </h1>
          <p className="text-muted-foreground mt-1">
            STAR+R stories, company-specific prep, and LinkedIn outreach.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button onClick={openNewDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Story
              </Button>
            }
          />
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Edit Story" : "Add Story"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(e) => updateForm("title", e.target.value)}
                    placeholder="Led product launch..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(val) => updateForm("category", val ?? "")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="situation">Situation</Label>
                <Textarea
                  id="situation"
                  value={form.situation}
                  onChange={(e) => updateForm("situation", e.target.value)}
                  placeholder="Context and background..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task">Task</Label>
                <Textarea
                  id="task"
                  value={form.task}
                  onChange={(e) => updateForm("task", e.target.value)}
                  placeholder="What was your responsibility..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="action">Action</Label>
                <Textarea
                  id="action"
                  value={form.action}
                  onChange={(e) => updateForm("action", e.target.value)}
                  placeholder="What did you do..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="result">Result</Label>
                <Textarea
                  id="result"
                  value={form.result}
                  onChange={(e) => updateForm("result", e.target.value)}
                  placeholder="What was the outcome (with metrics)..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reflection">Reflection</Label>
                <Textarea
                  id="reflection"
                  value={form.reflection}
                  onChange={(e) => updateForm("reflection", e.target.value)}
                  placeholder="What did you learn..."
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingId ? "Update" : "Save"} Story
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Job Selection + Generate Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Generate for a Job</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-2 min-w-[240px]">
              <Label>Select an evaluated job</Label>
              <Select
                value={selectedJobId}
                onValueChange={(val) => setSelectedJobId(val ?? "")}
              >
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Select a job..." />
                </SelectTrigger>
                <SelectContent>
                  {evaluatedJobs.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No evaluated jobs
                    </SelectItem>
                  ) : (
                    evaluatedJobs.map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.company} - {job.role}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleGeneratePrep}
              disabled={generatingPrep || !selectedJobId}
            >
              {generatingPrep ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Generate Prep
            </Button>
            <Button
              variant="outline"
              onClick={handleGenerateOutreach}
              disabled={generatingOutreach || !selectedJobId}
            >
              {generatingOutreach ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Users className="mr-2 h-4 w-4" />
              )}
              LinkedIn Outreach
            </Button>
          </div>
          {prepError && (
            <p className="text-sm text-red-600 mt-2">{prepError}</p>
          )}
          {outreachError && (
            <p className="text-sm text-red-600 mt-2">{outreachError}</p>
          )}
        </CardContent>
      </Card>

      {/* Generated Prep Display */}
      {prepData && (
        <Card>
          <CardHeader>
            <CardTitle>
              Interview Prep{selectedJob ? `: ${selectedJob.company} - ${selectedJob.role}` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview">
              <TabsList className="flex-wrap">
                <TabsTrigger value="overview">
                  <BookOpen className="mr-1 h-3.5 w-3.5" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="rounds">
                  <Layers className="mr-1 h-3.5 w-3.5" />
                  Rounds
                </TabsTrigger>
                <TabsTrigger value="questions">
                  <MessageSquare className="mr-1 h-3.5 w-3.5" />
                  Questions
                </TabsTrigger>
                <TabsTrigger value="stories">
                  <GraduationCap className="mr-1 h-3.5 w-3.5" />
                  Stories
                </TabsTrigger>
                <TabsTrigger value="redflags">
                  <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                  Red Flags
                </TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="mt-4">
                {prepData.overview ? (
                  <MarkdownRenderer content={prepData.overview} />
                ) : (
                  <p className="text-sm text-muted-foreground">No overview generated.</p>
                )}
              </TabsContent>
              <TabsContent value="rounds" className="mt-4">
                {prepData.rounds ? (
                  <MarkdownRenderer content={prepData.rounds} />
                ) : (
                  <p className="text-sm text-muted-foreground">No round details generated.</p>
                )}
              </TabsContent>
              <TabsContent value="questions" className="mt-4">
                {prepData.questions ? (
                  <MarkdownRenderer content={prepData.questions} />
                ) : (
                  <p className="text-sm text-muted-foreground">No questions generated.</p>
                )}
              </TabsContent>
              <TabsContent value="stories" className="mt-4">
                {prepData.stories ? (
                  <MarkdownRenderer content={prepData.stories} />
                ) : (
                  <p className="text-sm text-muted-foreground">No story recommendations generated.</p>
                )}
              </TabsContent>
              <TabsContent value="redflags" className="mt-4">
                {prepData.redFlags ? (
                  <MarkdownRenderer content={prepData.redFlags} />
                ) : (
                  <p className="text-sm text-muted-foreground">No red flags identified.</p>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* LinkedIn Outreach Display */}
      {outreachData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              LinkedIn Outreach
              {selectedJob && (
                <Badge variant="secondary">
                  {selectedJob.company}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {outreachData.contacts.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Suggested Contacts</h4>
                <div className="space-y-2">
                  {outreachData.contacts.map((contact, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{contact.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {contact.title}
                        </p>
                      </div>
                      {contact.linkedinUrl && (
                        <a
                          href={contact.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary underline"
                        >
                          View Profile
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">Connection Request</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    copyToClipboard(outreachData.connectionRequest, "connection")
                  }
                >
                  {copiedField === "connection" ? (
                    <Check className="h-3.5 w-3.5 mr-1" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 mr-1" />
                  )}
                  {copiedField === "connection" ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="rounded-lg border bg-muted/50 p-3 text-sm whitespace-pre-wrap">
                {outreachData.connectionRequest || "No connection request text generated."}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">InMail Message</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    copyToClipboard(outreachData.inMail, "inmail")
                  }
                >
                  {copiedField === "inmail" ? (
                    <Check className="h-3.5 w-3.5 mr-1" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 mr-1" />
                  )}
                  {copiedField === "inmail" ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="rounded-lg border bg-muted/50 p-3 text-sm whitespace-pre-wrap">
                {outreachData.inMail || "No InMail text generated."}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Story Bank */}
      <Card>
        <CardHeader>
          <CardTitle>Story Bank</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-64 flex-1" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </div>
          ) : stories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <GraduationCap className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Your story bank is empty</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Stories will be generated during interview prep, or you can add
                them manually using the Add Story button above.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Situation
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stories.map((story) => (
                  <TableRow key={story.id}>
                    <TableCell>
                      <Badge variant="secondary">{story.category}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{story.title}</TableCell>
                    <TableCell className="hidden md:table-cell max-w-[300px] truncate text-muted-foreground text-xs">
                      {story.situation}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(story)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(story.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
