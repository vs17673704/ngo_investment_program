"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { fieldClassName } from "@/components/ui/fieldStyles";
import { buttonStyles } from "@/components/ui/Button";

export function SearchFieldWithClear({
  id,
  name,
  label,
  defaultValue,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-on-surface-variant">
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={id}
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className={fieldClassName("pr-9")}
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              // Set the DOM value directly before requestSubmit(): React's
              // controlled-input state update is applied on the next render,
              // which happens after this synchronous handler returns, so
              // requestSubmit() would otherwise read the stale (pre-clear)
              // value straight off the input.
              if (inputRef.current) inputRef.current.value = "";
              setValue("");
              inputRef.current?.form?.requestSubmit();
            }}
            className={buttonStyles("ghost", "icon", "absolute right-2")}
          >
            <Icon name="close" className="text-[16px]" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
