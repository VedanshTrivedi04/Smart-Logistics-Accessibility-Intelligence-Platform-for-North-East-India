export type InspectionStatus = "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "REINSPECTION_REQUIRED" | "CANCELLED";
export type InspectionPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type EvidenceKind =
  | "WIDE_ANGLE"
  | "CLOSE_UP"
  | "DAMAGE_SCALE"
  | "GPS_SURVEY"
  | "PASSABILITY_PROOF"
  | "ENGINEERING_SKETCH";

export type DamageType =
  | "LANDSLIDE"
  | "FLOODING"
  | "BRIDGE_SCOUR"
  | "CULVERT_COLLAPSE"
  | "ROAD_EROSION"
  | "PAVEMENT_CRACKING"
  | "FALLEN_DEBRIS"
  | "OTHER";

export type PassabilityStatus =
  | "IMPASSABLE"
  | "EMERGENCY_ONLY"
  | "SINGLE_LANE_LIGHT"
  | "ALL_VEHICLES";

export type StructuralStability =
  | "STABLE"
  | "MONITORING_REQUIRED"
  | "IMMINENT_FAILURE"
  | "CRITICAL_FAILURE";

export interface TechnicalAssessment {
  road_condition: string;
  passability: PassabilityStatus;
  damage_type: DamageType;
  stability: StructuralStability;
  affected_length_m?: number | null;
  affected_width_m?: number | null;
  debris_depth_m?: number | null;
  bridge_pier_scour_depth_m?: number | null;
  water_level_over_road_cm?: number | null;
  slope_movement_detected?: boolean | null;
  heavy_vehicle_passable: boolean;
  recommended_speed_limit_kmh?: number | null;
  technical_notes: string;
  raw_measurements: Record<string, unknown>;
}

export interface InspectionEvidence {
  id: string;
  media_id: string;
  kind: EvidenceKind;
  caption?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  altitude_m?: number | null;
  azimuth_deg?: number | null;
  captured_at: string;
}

export interface Inspection {
  id: string;
  jurisdiction_id: string;
  assigned_to: string;
  assigned_by: string;
  priority: InspectionPriority;
  status: InspectionStatus;
  instructions: string;
  report_id?: string | null;
  incident_id?: string | null;
  candidate_edge_id?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  final_decision?: string | null;
  decision_notes?: string | null;
  assessment?: TechnicalAssessment | null;
  evidence: InspectionEvidence[];
}

export interface InspectionStats {
  counts: Record<string, number>;
}

export interface InspectorSummary {
  user_id: string;
  display_name: string;
  email: string | null;
  org_name: string;
}

/** What the client sends to attach one photo; the server assigns the id and capture timestamp. */
export interface InspectionEvidenceCreate {
  media_id: string;
  kind: EvidenceKind;
  caption?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  altitude_m?: number | null;
  azimuth_deg?: number | null;
}

export interface SubmitAssessmentRequest {
  assessment: TechnicalAssessment;
  evidence: InspectionEvidenceCreate[];
}
