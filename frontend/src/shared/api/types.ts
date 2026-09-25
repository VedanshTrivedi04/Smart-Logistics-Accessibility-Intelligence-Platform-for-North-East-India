import type { components } from "./schema";

/** Named aliases over the generated OpenAPI schemas. Never hand-write a second API truth here. */
type S = components["schemas"];

export type Principal = S["MeResponse"];
export type Report = S["ReportResponse"];
export type ReportCreate = S["ReportCreateRequest"];
export type ReportAmendment = S["ReportAmendmentRequest"];
export type ReviewDecisionRequest = S["ReviewDecisionRequest"];
export type ReviewDecisionResponse = S["ReviewDecisionResponse"];
export type Incident = S["IncidentResponse"];
export type Facility = S["FacilityResponse"];
export type Reachability = S["ReachabilityResponse"];
export type EdgeDetail = S["EdgeDetailResponse"];
export type NetworkVersion = S["NetworkVersionResponse"];
export type Vehicle = S["VehicleResponse"];
export type VehiclePosition = S["VehiclePositionResponse"];
export type Breadcrumb = S["BreadcrumbResponse"];
export type Driver = S["DriverResponse"];
export type Commitment = S["CommitmentResponse"];
export type Trip = S["TripResponse"];
export type TripStop = S["TripStopResponse"];
export type RoutePlan = S["RoutePlanResponse"];
export type RouteEvaluationRequest = S["RouteEvaluationRequest"];
export type AlternativeRoute = S["AlternativeRouteResponse"];
export type DispatchDecision = S["DispatchDecisionResponse"];
export type TripImpact = S["TripImpactResponse"];
export type FacilityImpact = S["FacilityImpactResponse"];
export type Jurisdiction = S["JurisdictionResponse"];
export type CoordinationAction = S["CoordinationActionResponse"];
export type CoordinationActionRequest = S["CoordinationActionRequest"];
export type CoordinationSummary = S["CoordinationSummaryResponse"];
export type CoordinationSubjectType = S["SubjectType"];
export type CoordinationActionType = S["ActionType"];
export type Media = S["MediaResponse"];
export type UploadTicket = S["UploadTicketResponse"];
export type BatchSyncResponse = S["BatchSyncResponse"];

// AI/ML Inference types
export type VerifyPhotoResponse = S["VerifyPhotoResponse"];
export type AutoTriageReportRequest = S["AutoTriageReportRequest"];
export type PredictRiskRequest = S["PredictRiskRequest"];
export type PredictRiskResponse = S["PredictRiskResponse"];
export type FeatureContribution = S["FeatureContributionResponse"];
export type EstimateEtaRequest = S["EstimateEtaRequest"];
export type EstimateEtaResponse = S["EstimateEtaResponse"];
export type OptimizeDispatchRequest = S["OptimizeDispatchRequest"];
export type OptimizeDispatchResponse = S["OptimizeDispatchResponse"];
export type DispatchRoute = S["DispatchRouteResponse"];
export type TranscribeVoiceResponse = S["TranscribeVoiceResponse"];
export type VoiceReportResponse = S["VoiceReportResponse"];
export type TranslateTextRequest = S["TranslateTextRequest"];
export type TranslateTextResponse = S["TranslateTextResponse"];
export type TextReportRequest = S["TextReportRequest"];

export type AccessibilityStatus = S["AccessibilityStatus"];
export type ReportType = S["ReportType"];
export type LaneStatus = S["LaneStatus"];
export type PassableVehicleClass = S["PassableVehicleClass"];
export type RoadSide = "HILLSIDE" | "VALLEY_SIDE" | "BOTH" | "UNKNOWN";
export const ROAD_SIDES: readonly RoadSide[] = ["HILLSIDE", "VALLEY_SIDE", "BOTH", "UNKNOWN"];

export type ReportSeverity = S["ReportSeverity"];
export type ReviewState = S["ReviewState"];
export type IncidentLifecycle = S["IncidentLifecycle"];
export type TripStatus = S["TripStatus"];
export type DeliveryStatus = S["DeliveryStatus"];
export type SlaStatus = S["SlaStatus"];
export type PriorityTier = S["PriorityTier"];
export type CargoCategory = S["CargoCategory"];
export type StaleStatus = S["StaleStatus"];
export type FixQuality = S["FixQuality"];
export type RouteResultStatus = S["RouteResultStatus"];
export type ReachabilityState = S["ReachabilityState"];
export type FacilityKind = S["FacilityKind"];
export type VehicleType = S["VehicleType"];
export type StopType = S["StopType"];
export type PolicyVersion = S["PolicyVersion"];
export type DispatchAction = S["DispatchAction"];
export type ImpactType = S["ImpactType"];
export type ImpactSeverity = S["ImpactSeverity"];
export type RecommendedAction = S["RecommendedAction"];
export type RejectionReason = S["RejectionReason"];
export type ResolutionReason = S["ResolutionReason"];
export type LocationProvider = S["LocationProvider"];
export type LocationPoint = S["LocationPointDTO"];
export type DeviceType = S["DeviceType"];

/** Capabilities mirror backend/app/modules/identity/domain/enums.py Capability. */
export const CAPABILITIES = [
  "VIEW_REPORT_SUMMARY",
  "VIEW_REPORT_DETAIL",
  "VIEW_REPORT_MEDIA",
  "SUBMIT_REPORT",
  "VERIFY_REPORT",
  "OVERRIDE_VERIFICATION",
  "VIEW_ROAD_STATUS",
  "UPDATE_ROAD_STATUS",
  "VIEW_REGION",
  "COMPUTE_ROUTE",
  "DISPATCH_ROUTE",
  "SUBMIT_GPS",
  "VIEW_FLEET",
  "VIEW_DRIVER_PII",
  "VIEW_IMPACT",
  "EXPORT_DATA",
  "RESPOND_EMERGENCY",
  "COORDINATE_RESPONSE",
  "MANAGE_IDENTITY",
  "MANAGE_GRANTS",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Enum value lists used to populate selects; must match the generated schema unions. */
export const REPORT_TYPES: readonly ReportType[] = [
  "LANDSLIDE",
  "FLOODING",
  "ROAD_DAMAGE",
  "BRIDGE_COLLAPSE",
  "TREE_FALL",
  "OBSTRUCTION",
  "WEATHER_HAZARD",
  "SECURITY_INCIDENT",
  "OTHER",
  "ROAD_CONDITION_UPDATE",
];
/** Report types an officer can file as a new incident. A road-condition update has its own form. */
export type IncidentReportType = Exclude<ReportType, "ROAD_CONDITION_UPDATE">;
export const INCIDENT_REPORT_TYPES: readonly IncidentReportType[] = REPORT_TYPES.filter(
  (t): t is IncidentReportType => t !== "ROAD_CONDITION_UPDATE",
);
export const REPORT_SEVERITIES: readonly ReportSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const VEHICLE_TYPES: readonly VehicleType[] = [
  "TRUCK_HEAVY",
  "TRUCK_MEDIUM",
  "VAN_LIGHT",
  "FOUR_WHEEL_DRIVE",
  "AMBULANCE_RESCUE",
  "TWO_WHEEL_SPECIAL",
];
export const CARGO_CATEGORIES: readonly CargoCategory[] = [
  "CRITICAL_MEDICAL",
  "COLD_CHAIN_VACCINES",
  "OXYGEN_CYLINDERS",
  "RELIEF_FOOD_WATER",
  "DISASTER_EQUIPMENT",
  "GENERAL_SUPPLIES",
];
export const PRIORITY_TIERS: readonly PriorityTier[] = ["TIER_1_LIFE_SAVING", "TIER_2_ESSENTIAL", "TIER_3_STANDARD"];
export const STOP_TYPES: readonly StopType[] = ["PICKUP", "DELIVERY", "WAYPOINT", "REST_CHECKPOINT", "RELIEF_CAMP"];
export const POLICY_VERSIONS: readonly PolicyVersion[] = ["CONSERVATIVE_CRITICAL_V1", "STANDARD_DISPATCH_V1"];
export const REJECTION_REASONS: readonly RejectionReason[] = [
  "DUPLICATE",
  "INACCURATE_LOCATION",
  "SPAM_OR_INVALID",
  "UNVERIFIABLE",
  "RESOLVED_PRIOR_TO_REVIEW",
  "OTHER",
];
export const RESOLUTION_REASONS: readonly ResolutionReason[] = [
  "REPAIRS_COMPLETED",
  "HAZARD_CLEARED",
  "FALSE_ALARM",
  "EXPIRED",
  "OTHER",
];
export const ACCESSIBILITY_STATUSES: readonly AccessibilityStatus[] = [
  "OPEN",
  "RESTRICTED",
  "BLOCKED",
  "PROVISIONAL_CAUTION",
  "UNKNOWN",
];
export const TRIP_TRANSITIONS: readonly TripStatus[] = [
  "DISPATCHED",
  "IN_TRANSIT",
  "HELD_FOR_INSPECTION",
  "DIVERTED",
  "COMPLETED",
  "CANCELLED",
  "ABORTED",
];
