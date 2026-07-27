import { redirect } from "next/navigation";

/** Legacy staff entry — the cashier workspace lives at `/cashier`. */
export default function Staff() {
  redirect("/cashier");
}
