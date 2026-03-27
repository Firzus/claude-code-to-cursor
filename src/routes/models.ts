import { getExposedModels } from "../model-parser";

export function handleModels(): Response {
  return Response.json({ object: "list", data: getExposedModels() });
}
