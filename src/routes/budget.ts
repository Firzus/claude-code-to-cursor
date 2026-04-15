import { getBudgetDaySummary } from "../db";

/** GET /api/budget — UTC-day token totals + rough USD estimate for the dashboard. */
export function handleBudget(): Response {
  return Response.json(getBudgetDaySummary());
}
