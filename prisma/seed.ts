import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  // Seed Ijaz as the first admin user
  const passwordHash = await bcrypt.hash("changeme123", 12)

  const user = await prisma.user.upsert({
    where: { email: "ijaz529@gmail.com" },
    update: {},
    create: {
      email: "ijaz529@gmail.com",
      name: "Ijaz Ahamed",
      passwordHash,
      role: "ADMIN",
      profile: {
        create: {
          fullName: "Ijaz Ahamed",
          email: "ijaz529@gmail.com",
          phone: "+49 15223317073",
          phoneDubai: "+971 585674529",
          location: "Berlin, Germany",
          linkedin: "linkedin.com/in/ijaz529/",
          github: "github.com/ijaz529",
          visaStatus:
            "EU (Germany) Permanent Resident & UAE (Dubai) Resident",
          targetRoles: [
            { name: "Product Operations Specialist", level: "Senior", fit: "primary" },
            { name: "Product Operations Manager", level: "Senior", fit: "primary" },
            { name: "Technical Product Manager", level: "Senior", fit: "primary" },
            { name: "Application Support Lead", level: "Senior", fit: "secondary" },
            { name: "Technical Operations Manager", level: "Mid-Senior", fit: "secondary" },
            { name: "Program Manager", level: "Senior", fit: "adjacent" },
          ],
          salaryRange: "75000-100000",
          currency: "EUR",
          preferences:
            "Berlin or Dubai, remote/hybrid preferred, fintech/payments/e-commerce, senior level",
          preferredTemplate: "basic-resume",
          preferredModel: "sonnet",
          cvMarkdown: `# CV -- Ijaz Ahamed

**Location:** Berlin, Germany / Dubai, UAE
**Email:** ijaz529@gmail.com
**Phone:** +49 15223317073 (Berlin) / +971 585674529 (Dubai)
**LinkedIn:** linkedin.com/in/ijaz529/
**GitHub:** github.com/ijaz529
**Visa:** EU (Germany) Permanent Resident & UAE (Dubai) Resident

## Professional Summary

Product Operations Specialist with 9 years of experience across fintech, e-commerce, and adtech. Managed feature rollouts across 18 markets at Delivery Hero, resolved payment API issues at Checkout.com and Wirecard, and identified a €300K/month revenue gap at Almedia. Recently shipped two mobile apps to the App Store and Play Store using AI-assisted development. AWS Certified Solutions Architect.

## Work Experience

### ALMEDIA -- Berlin, Germany
**Senior Technical Support Specialist**
November 2025 - February 2026
- Identified root cause of a €300K/month revenue mismatch between internal and client numbers by analyzing millions of install events
- Partnered directly with the COO to reconcile a 1% variance across all revenue streams

### DELIVERY HERO -- Berlin, Germany
**Product Operations Specialist**
September 2023 - October 2025
- Resolved production bugs across Foodpanda & Foodora in 18 markets, coordinating with PMs and Engineers across multiple squads
- Cleared a backlog of 100+ feature request tickets in 6 months by triaging impact, feasibility, and priority
- Led end-to-end testing and rollout of Grocery Item Replacements, Weighted Items, and Co-Funded Deals across all markets
- Deprecated an invalid order state in the order service API, eliminating erroneous vendor cancellation reasons

### CHECKOUT.COM -- Berlin, Germany
**Application Support Specialist**
April 2021 - March 2023
- Troubleshot production issues across Gateway, Processing, and Clearing payment APIs using log analysis (DataDog, Grafana)
- Implemented biannual scheme mandate changes with Product Managers, ensuring full merchant compliance
- Led weekly L1 retrospectives, reducing ticket escalations to L2

### WIRECARD -- Dubai, UAE
**Application Support Engineer** (September 2018 - March 2021)
**Implementation Intern** (May 2017 - August 2018)
- Owned onboarding of two major UAE currency exchange houses (Al Ansari & Al Fardan Exchange)
- Maintained 24/7 operations of the Corecard payment service provider
- Automated daily report generation using shell scripts
- Selected from a cohort of 20 interns for a full-time role

## Side Projects

### Wrestling Cards / Cricket Cards
**Founder & Product Owner** (February 2026 - Present)
- Built and shipped two full-stack mobile card games using AI-assisted development
- Directed full product lifecycle from concept to App Store & Play Store publication

## Education
- MSc Smart City Science -- Rochester Institute of Technology, Dubai (2018)
- BE Computer Science -- Anna University, Chennai (2016)

## Skills
- Domains: Banking (ISO 8583), Payments, E-Commerce, AdTech, Mobile Apps
- Technical: API Support, DataDog, Grafana, SQL, AWS, React Native, TypeScript
- Tools: JIRA, Confluence, Firebase, RevenueCat, Supabase
- Management: Product Management, Stakeholder Management, OKR Alignment

## Certifications
- AWS Certified Solutions Architect (SAA-C03)
- AWS Certified Cloud Practitioner (CLF-C01)
- ITIL Foundations

## Achievements
- Published author: "Introduction To DevOps for Operations"
- Shipped two mobile apps to App Store and Google Play Store`,
          cvStructured: {
            fullName: "Ijaz Ahamed",
            location: "Berlin, Germany / Dubai, UAE",
            email: "ijaz529@gmail.com",
            phone: "+49 15223317073",
            linkedin: "linkedin.com/in/ijaz529/",
            github: "github.com/ijaz529",
            summary:
              "Product Operations Specialist with 9 years of experience across fintech, e-commerce, and adtech. Managed feature rollouts across 18 markets at Delivery Hero, resolved payment API issues at Checkout.com and Wirecard, and identified a €300K/month revenue gap at Almedia. Recently shipped two mobile apps to the App Store and Play Store using AI-assisted development. AWS Certified Solutions Architect.",
            experience: [
              {
                title: "Senior Technical Support Specialist",
                company: "Almedia",
                location: "Berlin, Germany",
                startDate: "Nov 2025",
                endDate: "Feb 2026",
                bullets: [
                  "Identified root cause of a €300K/month revenue mismatch by analyzing millions of install events",
                  "Partnered directly with the COO to reconcile a 1% variance across all revenue streams",
                ],
              },
              {
                title: "Product Operations Specialist",
                company: "Delivery Hero",
                location: "Berlin, Germany",
                startDate: "Sep 2023",
                endDate: "Oct 2025",
                bullets: [
                  "Resolved production bugs across Foodpanda & Foodora in 18 markets",
                  "Cleared a backlog of 100+ feature request tickets in 6 months",
                  "Led end-to-end testing and rollout of Grocery Item Replacements, Weighted Items, and Co-Funded Deals",
                  "Deprecated an invalid order state in the order service API",
                ],
              },
              {
                title: "Application Support Specialist",
                company: "Checkout.com",
                location: "Berlin, Germany",
                startDate: "Apr 2021",
                endDate: "Mar 2023",
                bullets: [
                  "Troubleshot production issues across Gateway, Processing, and Clearing payment APIs",
                  "Implemented biannual scheme mandate changes with Product Managers",
                  "Led weekly L1 retrospectives, reducing ticket escalations to L2",
                ],
              },
              {
                title: "Application Support Engineer",
                company: "Wirecard",
                location: "Dubai, UAE",
                startDate: "Sep 2018",
                endDate: "Mar 2021",
                bullets: [
                  "Owned onboarding of two major UAE currency exchange houses (Al Ansari & Al Fardan Exchange)",
                  "Maintained 24/7 operations of the Corecard payment service provider",
                  "Automated daily report generation using shell scripts",
                ],
              },
              {
                title: "Implementation Intern",
                company: "Wirecard",
                location: "Dubai, UAE",
                startDate: "May 2017",
                endDate: "Aug 2018",
                bullets: [
                  "Selected from a cohort of 20 interns for a full-time role after a 15-month internship program",
                ],
              },
            ],
            education: [
              {
                institution: "Rochester Institute of Technology",
                location: "Dubai, UAE",
                degree: "MSc Smart City Science",
                endDate: "2018",
              },
              {
                institution: "Anna University, College of Engineering Guindy",
                location: "Chennai, India",
                degree: "BE Computer Science",
                endDate: "2016",
              },
            ],
            projects: [
              {
                name: "Wrestling Cards / Cricket Cards",
                role: "Founder & Product Owner",
                startDate: "Feb 2026",
                endDate: "Present",
                bullets: [
                  "Built and shipped two full-stack mobile card games using AI-assisted development",
                  "Directed full product lifecycle from concept to App Store & Play Store publication",
                ],
              },
            ],
            certifications: [
              { name: "AWS Certified Solutions Architect", issuer: "Amazon Web Services", code: "SAA-C03" },
              { name: "AWS Certified Cloud Practitioner", issuer: "Amazon Web Services", code: "CLF-C01" },
              { name: "ITIL Foundations", issuer: "Axelos" },
            ],
            skills: [
              { category: "Domains", items: ["Banking (ISO 8583)", "Payments", "E-Commerce", "AdTech", "Mobile Apps"] },
              { category: "Technical", items: ["API Support", "DataDog", "Grafana", "SQL", "AWS", "React Native", "TypeScript"] },
              { category: "Tools", items: ["JIRA", "Confluence", "Firebase", "RevenueCat", "Supabase"] },
              { category: "Management", items: ["Product Management", "Stakeholder Management", "OKR Alignment"] },
            ],
            achievements: [
              'Published author: "Introduction To DevOps for Operations"',
              "Shipped two mobile apps to App Store and Google Play Store",
            ],
          },
        },
      },
    },
  })

  console.log(`Seeded admin user: ${user.email} (${user.id})`)
  console.log("Default password: changeme123 — change this immediately after first login!")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
