// Client-side list filtering (Plans/Referrers/Users tables) is synchronous and
// instant, giving no visual feedback that a search or clear actually ran. This
// bar is driven by an explicit `active` flag the caller toggles for a short
// window around the filter update, rather than by real async load time.
export function SearchProgressBar({ active }: { active: boolean }) {
  return (
    <div aria-hidden className="h-1 w-full overflow-hidden rounded-full bg-surface-container-high">
      <div
        className={`h-full rounded-full bg-primary transition-all ease-out ${
          active ? "w-full duration-300" : "w-0 duration-150"
        }`}
      />
    </div>
  );
}
