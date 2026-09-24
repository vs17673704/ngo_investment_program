"use client";

import { fieldClassName } from "@/components/ui/fieldStyles";

export function AutoSubmitSelect({
  id,
  name,
  label,
  defaultValue,
  options,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-on-surface-variant">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        onChange={(e) => e.target.form?.requestSubmit()}
        className={fieldClassName()}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
