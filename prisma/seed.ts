import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function upsertUser(email: string, password: string, role: "ADMIN" | "USER", referralCode: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, role, referralCode, isEmailVerified: true },
  });
}

async function main() {
  console.log("Seeding demo data...");

  const admin = await upsertUser("admin@demo.local", "Admin@1234", "ADMIN", "ADMIN001");
  const demoUser = await upsertUser("user@demo.local", "User@1234", "USER", "USER0001");
  console.log(`Admin: ${admin.email} / Admin@1234`);
  console.log(`User:  ${demoUser.email} / User@1234`);

  const simpleInterest = await prisma.interestCalculationMethod.upsert({
    where: { id: "seed-simple-12" },
    update: {},
    create: {
      id: "seed-simple-12",
      name: "Simple 12% p.a.",
      formulaType: "SIMPLE",
      ratePercent: 12,
      tenureMonths: 12,
      dayCountBasis: "ACTUAL_365",
    },
  });

  const compoundInterest = await prisma.interestCalculationMethod.upsert({
    where: { id: "seed-compound-10" },
    update: {},
    create: {
      id: "seed-compound-10",
      name: "Compound 10% p.a. (quarterly)",
      formulaType: "COMPOUND",
      ratePercent: 10,
      tenureMonths: 24,
      compoundingFrequency: "QUARTERLY",
      dayCountBasis: "ACTUAL_365",
    },
  });

  await prisma.plan.upsert({
    where: { id: "seed-plan-basic" },
    update: {},
    create: {
      id: "seed-plan-basic",
      name: "Basic Growth Plan",
      tenureMonths: 12,
      paymentFrequency: "MONTHLY",
      presetAmounts: [1000, 2000, 5000],
      interestMethodId: simpleInterest.id,
      rewardPercent: 2,
      commissionPercent: 5,
      status: "ACTIVE",
    },
  });

  await prisma.plan.upsert({
    where: { id: "seed-plan-growth" },
    update: {},
    create: {
      id: "seed-plan-growth",
      name: "Premium Growth Plan",
      tenureMonths: 24,
      paymentFrequency: "MONTHLY",
      presetAmounts: [5000, 10000, 25000],
      interestMethodId: compoundInterest.id,
      rewardPercent: 3,
      commissionPercent: 7,
      status: "ACTIVE",
    },
  });

  const university = await prisma.university.upsert({
    where: { name: "Demo State University" },
    update: {},
    create: { name: "Demo State University" },
  });

  await prisma.course.upsert({
    where: { id: "seed-course-1" },
    update: {},
    create: {
      id: "seed-course-1",
      universityId: university.id,
      name: "B.Sc Computer Science",
      fee: 50000,
    },
  });

  await prisma.donationRecipient.upsert({
    where: { name: "Demo Relief Foundation" },
    update: {},
    create: { name: "Demo Relief Foundation" },
  });
  await prisma.donationRecipient.upsert({
    where: { name: "Demo Education Trust" },
    update: {},
    create: { name: "Demo Education Trust" },
  });

  const college1 = await prisma.college.upsert({
    where: { name: "Demo Engineering College" },
    update: {},
    create: { name: "Demo Engineering College" },
  });
  const college2 = await prisma.college.upsert({
    where: { name: "Demo Arts & Science College" },
    update: {},
    create: { name: "Demo Arts & Science College" },
  });

  const franchiseePlan = await prisma.franchiseePlan.upsert({
    where: { id: "seed-franchisee-1" },
    update: {},
    create: {
      id: "seed-franchisee-1",
      name: "Standard Franchisee Plan",
      oneTimeDeductiblePrice: 100000,
    },
  });

  await prisma.franchiseePlanCollegeMapping.upsert({
    where: {
      franchiseePlanId_collegeId: { franchiseePlanId: franchiseePlan.id, collegeId: college1.id },
    },
    update: {},
    create: { franchiseePlanId: franchiseePlan.id, collegeId: college1.id },
  });
  await prisma.franchiseePlanCollegeMapping.upsert({
    where: {
      franchiseePlanId_collegeId: { franchiseePlanId: franchiseePlan.id, collegeId: college2.id },
    },
    update: {},
    create: { franchiseePlanId: franchiseePlan.id, collegeId: college2.id },
  });

  await prisma.gadgetItem.upsert({
    where: { id: "seed-gadget-1" },
    update: {},
    create: {
      id: "seed-gadget-1",
      category: "Electronics",
      name: "Wireless Earbuds",
      price: 2000,
      stockQuantity: 50,
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
