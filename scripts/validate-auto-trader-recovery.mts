import { recoverActiveAutoTraders } from "../server/lib/autoTrader";

async function main() {
  const results = await recoverActiveAutoTraders("startup");
  console.log(JSON.stringify({ recoveredCount: results.length, results }, null, 2));
  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
