import { prisma } from "@/lib/db"

const GUEST_EMAIL = "ijaz529@gmail.com"

export async function getOrCreateGuestUser() {
  let user = await prisma.user.findUnique({
    where: { email: GUEST_EMAIL },
    include: { profile: true },
  })

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: GUEST_EMAIL,
        name: "Guest User",
        role: "USER",
        profile: { create: { fullName: "Guest User", email: GUEST_EMAIL } },
      },
      include: { profile: true },
    })
  }

  return user
}

export async function getUserId(): Promise<string> {
  const user = await getOrCreateGuestUser()
  return user.id
}
