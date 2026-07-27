import { redirect } from "next/navigation";

/** Booking lives on the home page cashier — keep /tickets as a stable alias. */
export default function Tickets() {
  redirect("/#booking");
}
