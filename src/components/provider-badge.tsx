const PROVIDER_CONFIG: Record<string, { label: string; classes: string }> = {
  openlibrary: {
    label: "Open Library",
    classes: "bg-mint/20 text-mint-dark",
  },
  google: {
    label: "Google Books",
    classes: "bg-slate/20 text-slate",
  },
  hardcover: {
    label: "Hardcover",
    classes: "bg-lavender/20 text-lavender-dark",
  },
  openbd: {
    label: "OpenBD",
    classes: "bg-peach/20 text-peach-dark",
  },
  goodreads: {
    label: "GoodReads",
    classes: "bg-pink/20 text-pink-dark",
  },
  amazon: {
    label: "Amazon",
    classes: "bg-peach/20 text-peach-dark",
  },
};

export default function ProviderBadge({
  providers,
}: {
  providers: string[];
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {providers.map((id) => {
        const config = PROVIDER_CONFIG[id];
        if (!config) return null;
        return (
          <span
            key={id}
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${config.classes}`}
          >
            {config.label}
          </span>
        );
      })}
    </div>
  );
}
