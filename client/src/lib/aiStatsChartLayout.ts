export const AI_STATS_MOBILE_CHART_LAYOUT = {
  confidenceContainer: "h-[240px] sm:h-[320px] min-w-0",
  outcomesContainer: "h-[220px] sm:h-[280px] min-w-0",
  header: "px-4 sm:px-6",
  controlRow: "flex flex-wrap gap-1.5 sm:gap-2",
} as const;

export const AI_STATS_MOBILE_CHART_MARGIN = {
  top: 10,
  right: 4,
  left: -12,
  bottom: 0,
} as const;

export const AI_STATS_MOBILE_AXIS = {
  tick: { fontSize: 10, fill: "#6b7280" },
  minTickGap: 18,
  confidenceYAxisWidth: 34,
  outcomesYAxisWidth: 26,
} as const;
