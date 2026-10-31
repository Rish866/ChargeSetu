import type {
  SessionUser,
  Station,
  StationStatus,
  VerificationStatus,
} from "@/lib/types";

/**
 * Pure business rules for who may do what with a station. Server actions call
 * these before touching data, and the Supabase RLS policies in
 * `supabase/migrations` enforce the same rules at the database layer.
 */

export type AdminUser = SessionUser & { role: "admin" };
export type OperatorUser = SessionUser & { role: "operator"; operatorId: string };

export function isAdmin(user: SessionUser | null): user is AdminUser {
  return user?.role === "admin";
}

/** An operator account that is linked to an operator (company) record. */
export function isOperator(user: SessionUser | null): user is OperatorUser {
  return user?.role === "operator" && !!user.operatorId;
}

export function canSubmitStation(user: SessionUser | null): boolean {
  return isOperator(user);
}

/** Operators may edit only their own stations; admins may edit any. */
export function canEditStation(
  user: SessionUser | null,
  station: Pick<Station, "operatorId">,
): boolean {
  if (isAdmin(user)) return true;
  return isOperator(user) && station.operatorId === user.operatorId;
}

export function canModerate(user: SessionUser | null): boolean {
  return isAdmin(user);
}

/** Allowed admin status transitions. */
const TRANSITIONS: Record<StationStatus, StationStatus[]> = {
  pending_review: ["published", "rejected"],
  published: ["inactive", "pending_review"],
  rejected: ["pending_review", "published"],
  inactive: ["published"],
};

export function canTransition(from: StationStatus, to: StationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Fields forced onto any station an operator creates or edits. Operators can
 * never publish or verify their own listings: every operator change goes back
 * to `pending_review` and loses its verified status until an admin re-checks.
 */
export function operatorModerationFields(): {
  status: StationStatus;
  verificationStatus: VerificationStatus;
  lastVerifiedAt: null;
  rejectionReason: null;
} {
  return {
    status: "pending_review",
    verificationStatus: "unverified",
    lastVerifiedAt: null,
    rejectionReason: null,
  };
}

/** Whether a station is visible on public pages. */
export function isPubliclyVisible(station: Pick<Station, "status">): boolean {
  return station.status === "published";
}
