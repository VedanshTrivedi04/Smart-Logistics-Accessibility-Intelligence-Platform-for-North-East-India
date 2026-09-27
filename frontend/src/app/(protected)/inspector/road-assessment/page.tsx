import type { Metadata } from "next";
import { RoadAssessmentView } from "@/features/inspection";

export const metadata: Metadata = {
  title: "Road Assessment & Corridor Health | Road Infrastructure Intelligence",
};

export default function RoadAssessmentPage() {
  return <RoadAssessmentView />;
}
