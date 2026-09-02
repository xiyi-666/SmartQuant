# AIQuartSmart Community Edition — Open Source Scope

This branch is the community edition of the quantitative research platform. It is intended for local development, learning, extension, and non-production research workflows.

## Included

- Web client shell, routing, responsive layout, themes, and localization
- Basic market-data provider interfaces and mock/CSV adapters
- Factor definitions, expression validation, previews, and example factors
- Strategy interfaces, templates, local backtesting, and basic metrics
- Paper-trading simulation and portfolio state held in the local deployment
- Single AI analyst sessions with user-supplied model configuration
- Community deployment configuration, environment examples, tests, and documentation

Risk monitoring is intentionally limited to provider data plus rules and
indicators configured by the user. The community UI does not include an
official AI assessment, dynamic risk weighting, or platform-authored scoring.

## Intentionally excluded

The following capabilities are not part of the community distribution and must be provided by a separately controlled service:

- Licensed or normalized restricted-data aggregation
- Production prompts, proprietary scoring weights, recommendation logic, and portfolio construction
- Multi-analyst collaboration, multi-agent orchestration, smart research, and production report pipelines
- Model routing, cost optimization, quality evaluation, and provider failover
- Billing, subscriptions, credit ledgers, payment processing, reward campaigns, and anti-abuse controls
- Enterprise SSO, organization governance, audit, private gateways, private data sources, and SLA operations
- Internal datasets, labels, evaluation sets, and operational runbooks

The following API namespaces are disabled by default in the community
deployment and return `COMMUNITY_FEATURE_UNAVAILABLE`: `/api/support`,
`/api/smart-research`, `/api/ai-insights`, and `/api/risk/ai-assessment`.
The `/api/agent-analysis` namespace remains available for one user-configured
analyst and one initial analysis round; multi-analyst collaboration and MCP
orchestration are not included.

The public interfaces may retain placeholders or compatibility contracts for these services, but the community deployment must not contain production credentials or proprietary implementations.

## Security and release requirements

- Configure all model and data credentials through local environment variables.
- Never commit real API keys, payment secrets, webhook secrets, cookies, or production URLs.
- Review generated files and user data before publishing a release.
- Add the final license and third-party notices before the first public tag.
- Keep community code and controlled services in separate repositories or separately distributed packages.
