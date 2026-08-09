import { revalidatePath, revalidateTag } from "next/cache";

export function revalidatePublicCms() {
  try {
    revalidatePath("/");
    revalidatePath("/location");
    revalidatePath("/api/public/content");
    revalidatePath("/api/public/locations");
    revalidateTag("public-cms");
  } catch {
    /* ignore outside Next request context */
  }
}
