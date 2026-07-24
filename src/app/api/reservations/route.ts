import { NextResponse } from "next/server";
import { z } from "zod";
const schema = z.object({
  date: z.string(),
  time: z.string(),
  adult: z.number().int().min(0),
  child: z.number().int().min(0),
  toddler: z.number().int().min(0),
  name: z.string().min(2),
  phone: z.string().min(7),
  email: z.string().email(),
});
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  return NextResponse.json(
    {
      reservationId: crypto.randomUUID(),
      status: "reserved",
      expiresInSeconds: 900,
      paymentUrl: "/success",
    },
    { status: 201 },
  );
}
