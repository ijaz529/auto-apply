import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

export async function getUserId(): Promise<string> {
  // Try NextAuth session first (real logged-in user)
  try {
    const session = await auth()
    if (session?.user?.id) return session.user.id
  } catch {
    // No session, continue to guest
  }

  // Fall back to the seeded admin user for now
  const guest = await prisma.user.findFirst({
    where: { email: "ijaz529@gmail.com" },
  })
  if (guest) return guest.id

  // Create a default guest if nothing exists
  const newGuest = await prisma.user.create({
    data: {
      email: `guest-${Date.now()}@autoapply.local`,
      name: "Guest User",
      role: "USER",
      profile: { create: { fullName: "Guest User" } },
    },
  })
  return newGuest.id
}
