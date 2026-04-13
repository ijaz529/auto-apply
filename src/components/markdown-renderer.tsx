"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        "prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-h1:text-xl prose-h2:text-lg prose-h3:text-base",
        "prose-p:leading-relaxed",
        "prose-a:text-primary prose-a:underline prose-a:underline-offset-2",
        "prose-table:text-sm prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-medium prose-th:border-b",
        "prose-td:px-3 prose-td:py-2 prose-td:border-b",
        "prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:font-mono",
        "prose-pre:rounded-lg prose-pre:bg-muted prose-pre:p-4",
        "prose-ul:list-disc prose-ol:list-decimal",
        "prose-li:marker:text-muted-foreground",
        "prose-blockquote:border-l-2 prose-blockquote:border-muted-foreground/30 prose-blockquote:pl-4 prose-blockquote:italic",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
