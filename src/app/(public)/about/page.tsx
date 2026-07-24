import { SITE } from "@/lib/domain";
import { H1, Body } from "@/components/ui/typography";
import { PageSection } from "@/components/layout/page-section";
import { Container } from "@/components/layout/container";
import { ImagePlaceholder } from "@/components/common/image-placeholder";
export default function About() {
  return (
    <PageSection tone="jungle">
      <Container className="grid gap-10 md:grid-cols-2">
        <ImagePlaceholder className="min-h-[420px]" />
        <div>
          <H1 className="text-5xl">О Лемурии Парке</H1>
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
