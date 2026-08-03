import { redirect } from "next/navigation";

/** Legacy route — booking lives on the approved home composition. */
export default function TicketsPage() {
  redirect("/#booking");
}
