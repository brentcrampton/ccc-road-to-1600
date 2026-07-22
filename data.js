/* Shared data for the Road to 1,600 dashboard (index.html) AND the website counter (embed.html).
   ⭐ THIS is now the file to update weekly — bump MASTER here when Maggie's confirmed-customer
   list updates. Both pages read from it, so one edit keeps the dashboard and the
   hillside.solutions counter in sync. Commit data.js alongside any other changes. */

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRl4kwEpiLnOkxVcwaPJqoXO9beOaH_P9wb8uSkzPJCNpFkgH61I_Ml_Kg-y44BKKT3lfO3dtn3-065/pub?gid=1242657682&single=true&output=csv"; // Weekly Log tab, published to web as CSV

const GOAL = 1600;
const BASELINE = 213;             // verified July 1, 2026

// Manually tallied from Maggie's master confirmed-customer list (color-coded onboarding batches).
// Updated by Brent's weekly notification — last updated 2026-07-18, total 238 (CCC 1–238).
const MASTER = {
  asOf: "Jul 18",
  batches: [
    {week:"Apr 15", n:51, launch:true}, {week:"Apr 22", n:11}, {week:"Apr 29", n:31},
    {week:"May 6",  n:22}, {week:"May 13", n:17}, {week:"May 20", n:26}, {week:"May 27", n:9},
    {week:"Jun 3",  n:13}, {week:"Jun 11", n:11}, {week:"Jun 17", n:18}, {week:"Jun 24", n:5},
    {week:"Jul 1",  n:8},  {week:"Jul 8",  n:9},  {week:"Jul 15", n:7}
  ]
};
const MASTER_TOTAL = MASTER.batches.reduce((s,b)=>s+b.n,0);
