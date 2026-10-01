import { takeConfidenceSnapshot } from "../server/confidenceScheduler";
import { getConfidenceHistory } from "../server/db";

const first = await takeConfidenceSnapshot();
const second = await takeConfidenceSnapshot();
const history = await getConfidenceHistory(7);

console.log(JSON.stringify({
  first,
  second,
  historyCount: history.length,
  uniqueDates: new Set(history.map(row => row.date)).size,
  latest: history[0] ?? null,
}, null, 2));
