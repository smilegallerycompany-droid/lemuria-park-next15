import "@/styles/public-awwwards.css";
import Script from "next/script";

// The counter ID is public, but the tag must be omitted until configured.
const metrikaId = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID?.trim();
const validMetrikaId = metrikaId && /^\d{5,12}$/.test(metrikaId) ? metrikaId : null;

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
      {validMetrikaId ? (
        <>
          <Script id="yandex-metrika" strategy="afterInteractive">
            {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${validMetrikaId},"init",{ssr:true,webvisor:true,clickmap:true,trackLinks:true,accurateTrackBounce:true});`}
          </Script>
          <noscript>
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://mc.yandex.ru/watch/${validMetrikaId}`}
                style={{ position: "absolute", left: "-9999px" }}
                alt=""
              />
            </div>
          </noscript>
        </>
      ) : null}
    </div>
  );
}
