import type { Metadata } from "next";
import { Users } from "lucide-react";

import { Badge, EmptyState } from "@/components/ui";
import { isCommittee, requireApprovedMemberPage } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Member directory" };

export default async function DirectoryPage() {
  const viewer = await requireApprovedMemberPage();
  const showContacts = isCommittee(viewer);

  const members = await prisma.user.findMany({
    where: { status: "APPROVED", role: { in: ["MEMBER", "COMMITTEE"] } },
    orderBy: [{ flatNumber: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      flatNumber: true,
      role: true,
    },
  });

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Member directory</h1>
        <p className="mt-1 text-sm text-ink-600">
          Approved members of the society.
          {showContacts
            ? " Contact details are visible to committee members."
            : " Contact details are visible to committee members only."}
        </p>
      </header>

      {members.length === 0 ? (
        <EmptyState
          icon={<Users className="h-9 w-9" />}
          title="No approved members yet"
          description="Members appear here once the managing committee approves their access."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-200 bg-ink-50 text-xs tracking-wide text-ink-500 uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Flat</th>
                  <th scope="col" className="px-5 py-3 font-medium">Name</th>
                  {showContacts ? (
                    <>
                      <th scope="col" className="px-5 py-3 font-medium">Email</th>
                      <th scope="col" className="px-5 py-3 font-medium">Phone</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="px-5 py-3 whitespace-nowrap text-ink-600">
                      {member.flatNumber || "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-medium text-ink-900">
                        {member.name || "—"}
                      </span>
                      {member.role === "COMMITTEE" ? (
                        <Badge tone="info" className="ml-2">
                          Committee
                        </Badge>
                      ) : null}
                    </td>
                    {showContacts ? (
                      <>
                        <td className="px-5 py-3 text-ink-600">
                          <a
                            className="hover:text-saffron-700 hover:underline"
                            href={`mailto:${member.email}`}
                          >
                            {member.email}
                          </a>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-ink-600">
                          {member.phone || "—"}
                        </td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-ink-500">
        Flat numbers and contact details are maintained by the managing
        committee. Contact them to correct your entry.
      </p>
    </div>
  );
}
