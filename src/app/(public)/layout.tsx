import "@/styles/public-awwwards.css";

/**
 * Public shell uses the approved awwwards visual system (scoped CSS).
 * Intentionally does NOT mount the previous shadcn SiteHeader/SiteFooter —
 * brand chrome lives inside the awwwards page composition.
 * Cashier/admin keep root globals.css + their own layouts.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-awwwards">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[var(--orange)] focus:px-4 focus:py-2 focus:text-white"
      >
        Перейти к содержимому
      </a>
      <div id="main-content">{children}</div>
    </div>
  );
}
