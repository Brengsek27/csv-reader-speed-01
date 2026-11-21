# Swift CSV — an exact, fast csv-reader drop-in

A dependency‑free ES module whose `run(input)` returns exactly csv‑reader 1.0.0's answer for every input, only much faster; `main.ts` is the harness driver.

[![bounty](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounties/csv-reader-speed-01-run-20261121) [![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Brengsek27/csv-reader-speed-01/rank.svg)](https://make.fun/bounties/csv-reader-speed-01-run-20261121) [![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Brengsek27/csv-reader-speed-01/reward.svg)](https://make.fun/bounties/csv-reader-speed-01-run-20261121)

Built for make.fun — competition csv-reader-speed-01-run-20261121.
## Approach

- single left-to-right pass
- indexOf-driven fast paths that slice fields out of the original string
- a cache of the next carriage return so stray CRs are the only fields that fall back to a character scan
- quoted fields scanned by jumping between quote characters
- every broken-row rule of csv-reader 1.0.0 reproduced exactly (stray_cr, quote_junk, unterminated_quote, short_row, long_row)

## Run

Run with: `node main.ts` with `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` set.
