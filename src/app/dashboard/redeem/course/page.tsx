import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getAvailableMargin, getCourseRedemptionPreviewInputs, computeCourseRedemptionPreview } from "@/lib/redemption-engine";
import { Icon } from "@/components/Icon";
import { formatINR } from "@/lib/format";
import CourseForm from "./CourseForm";

export default async function CourseRedeemPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [courses, availableMargin, previewInputs] = await Promise.all([
    prisma.course.findMany({ include: { university: true }, orderBy: { name: "asc" } }),
    getAvailableMargin(session.sub),
    getCourseRedemptionPreviewInputs(session.sub),
  ]);

  const previews = courses.map((c) => computeCourseRedemptionPreview(previewInputs, Number(c.fee)));

  return (
    <>
      <div className="flex w-full flex-col gap-4">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-primary">Redeem for a Course</h1>
        <p className="text-sm text-on-surface-variant">
          Available Margin: <span className="font-semibold text-primary">{formatINR(availableMargin)}</span>
        </p>

        {courses.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-lowest p-8 text-center shadow-sm">
            <Icon name="school" className="text-[32px] text-on-surface-variant" />
            <p className="text-sm text-on-surface-variant">No courses available yet.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {courses.map((c, i) => {
              const preview = previews[i];
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-primary">{c.name}</p>
                    <p className="text-sm text-on-surface-variant">{c.university.name}</p>
                    <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-on-surface-variant">
                      {preview.rewardPointsApplied > 0 && (
                        <>
                          <dt>Reward Points applied automatically</dt>
                          <dd>{preview.rewardPointsApplied}</dd>
                        </>
                      )}
                      <dt>Newly earned Reward Points (on approval)</dt>
                      <dd>{preview.newlyEarnedRewardPoints}</dd>
                    </dl>
                  </div>
                  <CourseForm courseId={c.id} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
