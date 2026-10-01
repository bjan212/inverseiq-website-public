import { z } from "zod";
import { AUTO_TRADER_START_CONFIRMATION } from "@shared/const";

/** Prevent stale clients, reloads, or replayed mutations from enabling live trading. */
export const autoTraderStartConfirmationSchema = z.object({
  confirmation: z.literal(AUTO_TRADER_START_CONFIRMATION),
}).strict();
