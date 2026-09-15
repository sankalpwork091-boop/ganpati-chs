import "../scripts/load-env";

import { PrismaClient } from "@prisma/client";

import { getDatabaseUrl } from "../src/lib/getDatabaseUrl";

/**
 * Seeds the fixed document category list and the first Terms & Conditions
 * version. Safe to re-run: categories are upserted by slug and the T&C is only
 * created if version 1 is absent.
 *
 * Run with: npm run db:seed
 */

const CATEGORIES: Array<{
  slug: string;
  name: string;
  visibleToMembers?: boolean;
  sensitive?: boolean;
}> = [
  { slug: "sgbm-management", name: "SGBM / Management" },
  { slug: "minutes-of-meeting", name: "Minutes of Meeting" },
  { slug: "member-information", name: "Member Information" },
  { slug: "consent-letters", name: "Consent Letters", sensitive: true },
  { slug: "79a-noc", name: "79A NOC" },
  { slug: "paaa", name: "PAAA", sensitive: true },
  { slug: "development-agreement", name: "Development Agreement", sensitive: true },
  { slug: "pmc-appointment", name: "PMC Appointment" },
  { slug: "pmc-agreement", name: "PMC Agreement", sensitive: true },
  { slug: "notices", name: "Notices" },
  { slug: "cases-proceedings", name: "Cases / Proceedings" },
  { slug: "monthly-reports", name: "Monthly Reports" },
  { slug: "weekly-site-updates", name: "Weekly Site Updates" },
  { slug: "material-testing-reports", name: "Material Testing Reports" },
  { slug: "images", name: "Images" },
  { slug: "video-recordings", name: "Video Recordings" },
  { slug: "architectural-plans", name: "Architectural Plans" },
  { slug: "cc", name: "CC (Commencement Certificate)" },
  { slug: "oc", name: "OC (Occupancy Certificate)" },
  { slug: "nocs", name: "NOCs" },
  // Hidden from members entirely — used to verify the upload pipeline in QA.
  { slug: "test-folder-automated", name: "Test Folder — Automated", visibleToMembers: false },
];

const TERMS_V1_TITLE = "Ganpati CHS Member Portal — Terms & Conditions";

const TERMS_V1_BODY = `**Ganpati Co-operative Housing Society Ltd.**
Sector 19, Nerul, Navi Mumbai
Redevelopment project managed by Sankalp Project Management Consultants Pvt. Ltd.

By requesting and using access to this member portal, you agree to the following terms.

**1. Who may use this portal**
Access is granted only to registered members of Ganpati Co-operative Housing Society Ltd. and to persons expressly authorised by the Managing Committee. Access is personal to you. You must not share your login, allow anyone else to use your account, or request access on behalf of another person.

**2. Confidentiality**
The documents, drawings, agreements, notices, reports, photographs and recordings made available through this portal are confidential records of the Society and its redevelopment project. They are provided to you solely so that you can stay informed as a member of the Society.

You must not publish, forward, upload, post, circulate or otherwise disclose any material from this portal — in whole or in part, in original or altered form — to any person who is not a member of the Society, including on social media, messaging groups that include non-members, or any public website. You must not use any material from this portal for any commercial purpose.

**3. Downloads and copies**
Any copy you download remains subject to these terms. You are responsible for keeping downloaded copies secure and for destroying them if your membership ends or your access is withdrawn. Downloads may be logged, and copies of sensitive documents may carry a watermark identifying the member who downloaded them and the time of download.

**4. Accuracy and status of documents**
Documents are published for information only. Drafts, proposals, projections, timelines and site updates may change as the redevelopment progresses, and a document published here may be superseded without notice. Nothing in this portal constitutes legal, financial, structural or professional advice, and nothing here creates a contractual obligation on the part of the Society, the Managing Committee, or the Project Management Consultant.

Where a matter is governed by an executed agreement, statutory approval or resolution of the general body, that instrument prevails over anything shown in this portal. You should rely on certified copies obtained from the Society for any legal or financial purpose.

**5. Personal data**
The portal stores your name, email address, profile photograph from your Google account, and — where the Managing Committee records it — your flat number and contact number. It also records your activity in the portal, including sign-ins, documents you download and notices you open. This information is used to administer access, to maintain an audit trail, and to confirm that notices have reached members. It is not sold or shared outside the Society and its Project Management Consultant.

**6. Access may be withdrawn**
The Managing Committee may approve, refuse, suspend or withdraw access at any time, at its discretion and without being required to give reasons — including where membership ends, where these terms are breached, or where the Committee considers withdrawal necessary to protect the Society's interests.

**7. Your responsibilities**
You agree to keep your Google account secure, to notify the Managing Committee promptly if you believe your account has been misused, and not to attempt to gain access to any part of the portal you have not been granted, to interfere with its operation, or to extract material from it by automated means.

**8. Breach**
Breach of these terms may result in immediate withdrawal of access and may be placed before the Managing Committee or the general body. Unauthorised disclosure of confidential Society records may additionally expose you to action under applicable law and under the bye-laws of the Society.

**9. Changes to these terms**
These terms may be revised. Where they are, you will be asked to read and accept the revised version the next time you sign in. The version you accept, and the date and time of your acceptance, are recorded.

**10. Contact**
Questions about these terms, about your access, or about anything published here should be directed to the Managing Committee of Ganpati Co-operative Housing Society Ltd., or to Sankalp Project Management Consultants Pvt. Ltd., 1105 Ellora Fiesta, Sector 11, Sanpada, Navi Mumbai 400705.

By ticking the acceptance box you confirm that you have read these terms, that you are a member of the Society or an authorised person, and that you agree to be bound by them.`;

async function main() {
  const url = await getDatabaseUrl();
  const prisma = new PrismaClient({ datasourceUrl: url });

  try {
    console.log("Seeding document categories...");
    for (const [index, category] of CATEGORIES.entries()) {
      await prisma.documentCategory.upsert({
        where: { slug: category.slug },
        update: {
          name: category.name,
          sortOrder: index + 1,
          visibleToMembers: category.visibleToMembers ?? true,
          sensitive: category.sensitive ?? false,
        },
        create: {
          slug: category.slug,
          name: category.name,
          sortOrder: index + 1,
          visibleToMembers: category.visibleToMembers ?? true,
          sensitive: category.sensitive ?? false,
        },
      });
    }
    console.log(`  ${CATEGORIES.length} categories ready.`);

    const existingTerms = await prisma.termsVersion.findUnique({
      where: { version: 1 },
    });

    if (existingTerms) {
      console.log("Terms & Conditions v1 already present — leaving it untouched.");
    } else {
      await prisma.termsVersion.create({
        data: {
          version: 1,
          title: TERMS_V1_TITLE,
          body: TERMS_V1_BODY,
          active: true,
        },
      });
      console.log("Terms & Conditions v1 created and marked active.");
    }

    const adminCount = await prisma.adminCredential.count();
    if (adminCount === 0) {
      console.log(
        "\nNo administrator account exists yet. Create one with:\n  npm run seed:admin\n",
      );
    }

    console.log("Seed complete.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
