import { notFound } from "next/navigation";

/** Any URL that matches no page shows the normal (localised) not-found page. */
export default function CatchAll() {
  notFound();
}
