# Device results (template for the owner)

Status: **pending owner hardware.** The scripts below are ready and print one JSON document each. Nothing in this
repository has been measured on the owner's MacBook or on the D1 reference device; the numbers in the phase reports come
from a shared 4-core cloud machine. This item is closed only when the owner has run the commands, committed the two JSON
files and filled in the table at the bottom.

## Commands (run from the repository root, on the device)

```bash
pnpm install
pnpm exec tsx scripts/mathcore/bench.ts > docs/mathcore/reports/device-node.json
```

```bash
pnpm run build
pnpm exec vite preview --port 4173 &
MATHCORE_CHROMIUM=/path/to/chromium node scripts/mathcore/bench-browser.cjs > docs/mathcore/reports/device-browser.json
```

`MATHCORE_CHROMIUM` is only needed when Playwright's own browser is not installed. For a two-core measurement on Linux
prefix the second command with `taskset -c 0,1`; on macOS there is no core pinning, so report the logical core count
the machine has. `MATHCORE_RUNS=15` raises the runs per browser case from 9. `MATHCORE_CORES=n` only changes the core
count the page reports (it sizes the strip Workers); it does not limit the CPU and must not be used for a 2-core claim.

Each script prints a table to stderr and the JSON to stdout, so the redirect above keeps only the JSON.

## JSON fields

Common to both files:

| Field | Meaning |
|---|---|
| `schema` | 1 |
| `kind` | `"node"` (`bench.ts`, one thread) or `"browser"` (`bench-browser.cjs`, engine Worker + strip Workers) |
| `date`, `commit` | ISO time and the git commit measured |
| `device.os`, `platform`, `arch`, `cpuModel`, `logicalCores`, `memoryGB` | the machine |
| `cases[]` | one entry per budget case (below) |
| `passed`, `failed` | counts of cases within budget |

Each `cases[]` entry: `id`, `description`, `unit` (`"ms"` or `"samples/s"`), `comparator` (`"<="` for times, `">="` for
throughput), `budget` (STEPS.md §7.2), `median`, `max` (slowest run), `runs`, `pass` (median within budget).

`bench.ts` adds `runtime.node`. `bench-browser.cjs` adds `browser.name`, `version`, `userAgent`, `platform`,
`deviceMemoryGB`, `devicePixelRatio`, `logicalCoresReported` and `coresOverride`; its cases are `reference-drag`,
`reference-release`, `dense-drag` and `dense-release` (budgets 16 ms and 150 ms, Worker round trip including message
copies).

## To fill in after running

| Item | Value |
|---|---|
| Device (model, year) | |
| CPU and logical cores | |
| OS and browser version | |
| `device-node.json` committed (path) | |
| `device-browser.json` committed (path) | |
| Cases over budget (ids) | |
| Reference device D1 identified (yes/no, name) | |
| Phase 0 item 5 ("budgets adjusted by measurement") decided by the owner (yes/no) | |
