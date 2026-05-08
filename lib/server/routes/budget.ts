import { getBudgetDaySummary } from "../db";

/** GET /api/budget — UTC-day token totals + rough USD estimate for the dashboard. */
export async function handleBudget(): Promise<Response> {
  return Response.json(await getBudgetDaySummary());
}
