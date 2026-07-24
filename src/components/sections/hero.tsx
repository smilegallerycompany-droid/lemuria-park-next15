import Image from "next/image";
import Link from "next/link";
import { Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Lead } from "@/components/ui/typography";
import { SITE, CTA_BUY_TICKET_LABEL, CTA_BUY_TICKET_HREF } from "@/constants/site";
export function Hero() {
  return (
    <section className="jungle-bg overflow-hidden">
      <div className="container-site grid min-h-[560px] items-center gap-8 py-12 lg:grid-cols-2 lg:pb-28">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-green-500 bg-white px-4 py-2 text-sm font-bold text-green-700">
            <Leaf size={16} />
            Живое общение с лемурами
          </span>
          <h1 className="mt-5 text-5xl font-black tracking-tight md:text-7xl">{SITE.name}</h1>
          <h2 className="mt-3 text-2xl font-extrabold text-green-600">Зоотеатр лемуров</h2>
          <Lead className="mt-5 max-w-xl">
            Добро пожаловать в мир дружелюбных лемуров! Живое общение, яркие эмоции и фотографии,
            которые захочется сохранить.
          </Lead>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={CTA_BUY_TICKET_HREF}>{CTA_BUY_TICKET_LABEL}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/about">Узнать больше</Link>
            </Button>
          </div>
        </div>
        <div className="relative self-end">
          <Image
            src="/assets/lemur.png"
            alt="Кольцехвостый лемур"
            width={800}
            height={800}
            className="mx-auto max-h-[520px] w-auto object-contain drop-shadow-2xl"
            priority
          />
        </div>
      </div>
    </section>
  );
}
