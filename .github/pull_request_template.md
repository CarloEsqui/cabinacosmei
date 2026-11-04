<!-- Atlas project-scaffold: PR template. The audit checkbox is what makes the
     critical-surfaces gate real — a rule nobody has to remember.
     COUPLING (load-bearing): atlas-guard.yml greps these checkbox lines by
     substring, and each checkbox must stay on ONE physical line. Change wording
     here and in .github/workflows/atlas-guard.yml IN THE SAME PR. -->

## What & why

[One paragraph: the change and the need it answers. Link the spec/plan if one exists.]

## Critical surfaces

- [ ] This change does **not** touch any `critical_surfaces` entry of PROJECT.md, and creates no new critical surface — evaluated because: [one line]
- [ ] …or it **touches** one, and here is the gate:
  - Audit report: [link to `<paths.notes>/auditoria-…`]
  - Evidence report answering it: [link to `<paths.notes>/evidencia-…`]
- [ ] …or it **creates** one: the new surface enters `critical_surfaces` (+ its paths in `sensitive_globs` and CODEOWNERS) **in this PR**
- [ ] …or it **applies** a verdict or plan item that requires editing the contract or the enforcement layer — link: [verdict or plan path]

## Architecture Gate

- [ ] No Gate 001 trigger applies — canonical list in `gates/architecture.md`: new module/service, major system boundaries, data ownership, significant DB change, auth/authz, new infrastructure, new external dependency, public or important API, significant coupling, scalability implications, expensive to reverse
- [ ] …or one does, and the verdict artifact is: [link to `<paths.notes>/gate-001-…`]

## Verification

- [ ] The `verification` commands of PROJECT.md pass locally (CI re-checks)
- [ ] Migrations (if any) follow the audited-header template — the applied-migrations log records them when applied; that log entry, not this box, is the proof of application
- [ ] Documentation touched by this change is updated (or none was touched)

## Anything the reviewer should not have to discover alone

[Deliberate decisions, known limitations, follow-ups — or "None".]
