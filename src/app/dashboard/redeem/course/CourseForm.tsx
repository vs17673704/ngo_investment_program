"use client";

import { useActionState } from "react";
import { submitCourseRedemptionAction } from "../actions";

export default function CourseForm({ courseId }: { courseId: string }) {
  const [state, formAction, pending] = useActionState(
    submitCourseRedemptionAction.bind(null, courseId),
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
      >
        {pending ? "Requesting..." : "Request"}
      </button>
      {state?.error && <p className="max-w-[200px] text-right text-xs text-error">{state.error}</p>}
    </form>
  );
}
