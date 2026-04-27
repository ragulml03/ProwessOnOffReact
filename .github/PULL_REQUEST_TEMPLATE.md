## What does this PR do?
<!-- One sentence description -->

---

## Feature Flag Review Checklist
<!-- Required for any PR that adds or changes a flag or A/B test -->

### LaunchDarkly
- [ ] Flag key uses kebab-case (`react-page-variant`, not `reactPageVariant`)
- [ ] Flag has a description set in the LD dashboard
- [ ] `ldClient.track()` fires on the conversion action
- [ ] Kill-switch tested: flag OFF → correct .NET fallback renders, no error
- [ ] Streaming behaviour confirmed: live flag change reflects in React without reload

### VWO
- [ ] Campaign ID constant is correct (`VWO_..._CAMPAIGN_ID = <id from VWO URL>`)
- [ ] `trackVwoGoal()` fires on the conversion action
- [ ] Skeleton loader shows while variation resolves (`isLoading` guard in place)
- [ ] Debug badge removed from production code (no "Live Experiment Variant Active" text)
- [ ] Variation tested with URL param (`?_vis_opt_exp_<id>_combi=2`)

### Analytics
- [ ] Conversion event includes `vwoVariation` field for A/B analysis
- [ ] No PII (name, email, phone) in event payloads

### Cleanup Plan
- [ ] Ticket created to remove this flag after 100% rollout: <!-- link ticket here -->
- [ ] Estimated rollout completion date: <!-- date -->
