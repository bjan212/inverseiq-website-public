import { z } from "zod";
import { AUTO_TRADER_STOP_CONFIRMATION } from "@shared/const";

/** Prevent stale clients, reloads, or empty mutations from disabling live trading. */
export const autoTraderStopInputSchema = z.object({
  confirmation: z.literal(AUTO_TRADER_STOP_CONFIRMATION),
}).strict();
