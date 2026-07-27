import Image from "next/image";
import { SITE } from "@/lib/domain";
import { H1, Body } from "@/components/ui/typography";
import { PageSection } from "@/components/layout/page-section";
import { Container } from "@/components/layout/container";
import { Card } from "@/components/ui/card";

export default function About() {
  return (
    <PageSection tone="jungle" className="py-14">
      <Container className="grid items-center gap-10 md:grid-cols-2">
        <Card variant="glass" className="overflow-hidden p-4">
          <Image
            src="/assets/lemur.png"
            alt="Кольцехвостый лемур"
            width={800}
            height={800}
            className="mx-auto size-auto max-h-[420px] object-contain"
          />
        </Card>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-orange">О нас</p>
          <H1 className="mt-2 font-display text-4xl font-semibold md:text-5xl">О Лемурии Парке</H1>
          <Body className="mt-6 leading-8 text-muted-foreground">
            Зоотеатр для живого общения с кольцехвостыми лемурами. Посещение организовано по сеансам
            — не более {SITE.capacity} гостей одновременно.
          </Body>
          <Body className="mt-4 leading-8 text-muted-foreground">
            Сотрудники расскажут о животных, помогут с общением и фотографиями. Проект
            позиционируется как зоотеатр.
          </Body>
        </div>
      </Container>
    </PageSection>
  );
}
