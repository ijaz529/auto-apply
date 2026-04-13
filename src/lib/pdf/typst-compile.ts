import { execFile } from "child_process"
import { writeFile, unlink, readFile } from "fs/promises"
import { randomUUID } from "crypto"
import { tmpdir } from "os"
import path from "path"

/**
 * Find the typst binary. Checks common locations and falls back to PATH.
 */
async function findTypstBinary(): Promise<string> {
  const candidates = [
    "/opt/homebrew/bin/typst",
    "/usr/local/bin/typst",
    "/usr/bin/typst",
  ]

  for (const candidate of candidates) {
    try {
      await readFile(candidate)
      return candidate
    } catch {
      // not found, try next
    }
  }

  // Fall back to `typst` on PATH (resolved by execFile via shell)
  return "typst"
}

/**
 * Compile a Typst source string into a PDF buffer.
 *
 * Writes the .typ content to a temp file, invokes the typst compiler,
 * reads the resulting PDF, cleans up temp files, and returns the PDF buffer.
 */
export async function compileTypst(typContent: string): Promise<Buffer> {
  const id = randomUUID()
  const typPath = path.join(tmpdir(), `${id}.typ`)
  const pdfPath = path.join(tmpdir(), `${id}.pdf`)

  await writeFile(typPath, typContent, "utf-8")

  const typstBin = await findTypstBinary()

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        typstBin,
        ["compile", typPath, pdfPath],
        { timeout: 30_000 },
        (error, _stdout, stderr) => {
          if (error) {
            reject(
              new Error(
                `Typst compilation failed: ${stderr || error.message}`
              )
            )
          } else {
            resolve()
          }
        }
      )
    })

    const pdfBuffer = await readFile(pdfPath)
    return pdfBuffer
  } finally {
    // Clean up temp files regardless of success or failure
    await Promise.allSettled([unlink(typPath), unlink(pdfPath)])
  }
}
