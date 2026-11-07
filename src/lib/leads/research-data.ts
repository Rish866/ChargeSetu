import data from "../../../data/research/mumbai-navi-mumbai-lead-verification.json";
import type { ResearchEntry } from "./research.ts";

/** Findings bundled with the app (reviewed in git); no database access needed. */
export const researchEntries = data.entries as unknown as ResearchEntry[];
export const researchDate: string = data.researchedOn;
