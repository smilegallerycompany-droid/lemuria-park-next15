import type { PrismaClient } from "@prisma/client";
import type { CheckInResponse } from "./check-in";

type InvitationParams = {
  qrToken: string;
  cashierId: string;
  allowedLocationIds?: string[];
};

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Use the same policy as the maintenance workers.
const policy = require("./invitation-policy.cjs") as {
  checkInInvitation(db: PrismaClient, params: InvitationParams): Promise<CheckInResponse | null>;
};

export function checkInInvitation(db: PrismaClient, params: InvitationParams) {
  return policy.checkInInvitation(db, params);
}
