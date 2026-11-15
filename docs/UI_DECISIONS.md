# UI decisions

- Use indigo for primary actions, neutral surfaces, soft borders and Inter variable typography.
- Keep existing API requests, authentication and attendance recognition behavior.
- Extend existing shared components with backwards-compatible props.
- Persist light/dark preference and honor the system default.
- Split independent visual work across shared components, camera workflows and academic/data pages.
- Use existing response fields for summaries and expose missing-data states instead of inventing metrics.
- Verify at 375, 768, 1280 and 1536 pixels in both themes.

- Keep raw exception details in development logs. Runtime fallback screens show recovery actions.
- Use React.lazy for route screens and retain current navigation and auth entry points.
- Preserve actual cosine score meaning rather than presenting a calibrated probability.

## Visual refinement

- Use direct screen titles and one primary attendance action on the overview.
- Move diagnostics below attendance and schedule information.
- Give sign-in, registration and first-time setup a compact shared form layout.
- Use a plain curriculum summary based on the loaded courses and credits.
- Remove decorative labels from enrollment, recognition and navigation.
