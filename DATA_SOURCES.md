# Community data-source policy

The community edition runs data providers from the user's deployment. It does
not proxy requests through, or include credentials for, a project-operated
production data gateway.

The repository may contain provider interfaces and optional adapters for public
services. These adapters are connection code only; they do not grant a licence
to redistribute market data, exchange data, financial statements, or other
third-party content.

Before enabling a provider, the operator must review that provider's current
terms, rate limits, attribution requirements, authentication rules, caching
rights, and usage restrictions. Do not commit API keys, cookies,
licensed data files, or bulk historical snapshots.

The Apache-2.0 licence applies to the project source code only. Data returned by
a provider remains subject to the provider's own licence and terms. Mock and
CSV providers are supplied for local development and testing.

## Deployment contract

1. Configure provider credentials and endpoints in the local environment.
2. Keep requests and caching within the provider's documented limits.
3. Do not expose a provider credential through the browser bundle.
4. Do not re-host or resell provider data unless separately authorised.
5. If a provider is unavailable, use a local Mock/CSV provider rather than a
   hidden fallback to a project-controlled gateway.
