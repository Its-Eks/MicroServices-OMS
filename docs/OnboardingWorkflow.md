## Canonical Onboarding Workflow (10 steps)

The service standardizes onboarding to the following ordered steps:

1. initiated – Onboarding process has been started
2. welcome_sent – Welcome email has been sent to customer
3. service_setup – Configure service parameters and account setup
4. equipment_ordered – Equipment has been ordered for installation
5. equipment_shipped – Equipment has been shipped to customer
6. installation_scheduled – Installation appointment has been scheduled
7. installation_completed – Service installation has been completed
8. service_activated – Service has been activated and tested
9. follow_up – Post-activation follow-up and support setup
10. completed – Onboarding process has been completed successfully

### Aliasing / Normalization
Incoming external states are normalized to the above canonical IDs where applicable. See `onboarding.service.ts` for mapping utilities.

### Valid Transitions
- Forward-only by default (configurable)
- Service guards may validate required data before moving to the next state


