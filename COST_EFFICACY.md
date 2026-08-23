# Cost efficacy

Relay has two possible economic benefits:

1. Lower input cost because a receiving model loads a compact checkpoint instead of a long transcript.
2. Less repeated work because more resumes preserve the correct objective, constraints, and verified state.

The second effect dominates in every included scenario. This means the product should not be funded on a token-compression claim. It should be funded only after a controlled resume benchmark shows fewer failures or materially faster recovery.

## Sensitivity scenarios

These figures are assumptions produced by `npm run cost`. They are not empirical product results.

| Scenario | Relays / month | Raw to capsule tokens | Assumed resume failures | Token savings / month | Recovery savings / month | Net savings / month | Build-cost payback |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Conservative | 500 | 50k to 10k | 10% to 8% | $40 | $188 | $203 | 98.8 months |
| Base | 2,000 | 100k to 12k | 18% to 8% | $528 | $10,000 | $10,478 | 2.9 months |
| High volume | 10,000 | 200k to 20k | 25% to 8% | $9,000 | $159,375 | $168,125 | 0.6 months |

The conservative case is not attractive. The base and high-volume cases are attractive only because they assume a meaningful reduction in failed resumes. That assumption is the primary product risk and must be measured.

## Formulas

```text
token_savings = relays * (raw_tokens - capsule_tokens) * input_price_per_token

avoided_failures = relays * (baseline_failure_rate - relay_failure_rate)

recovery_savings = avoided_failures * recovery_hours * loaded_labor_cost

net_monthly_savings = token_savings + recovery_savings - infrastructure_cost

payback_months = one_time_build_cost / net_monthly_savings
```

## Build-cost planning ranges

These are planning estimates, not vendor quotes:

- Protocol prototype: 1 to 2 engineer-weeks, roughly $5k to $20k loaded cost.
- Team pilot with two real harness integrations and an evaluation: 6 to 10 engineer-weeks, roughly $50k to $150k.
- Production service with SSO, policy, revocation, encrypted artifact storage, audit, and reliability work: 3 to 6 engineer-months, roughly $150k to $500k.

## Evidence gate

Before claiming positive ROI, run at least 20 matched interrupted tasks per condition:

- Fresh start
- Raw transcript
- Naive structured summary
- Relay capsule

Measure final task success, time to first correct action, repeated actions, false inherited claims, duplicate side effects, and total tokens. Use `scripts/evaluate.mjs` to summarize the observations. Replace the model's failure-rate assumptions with measured confidence intervals.
