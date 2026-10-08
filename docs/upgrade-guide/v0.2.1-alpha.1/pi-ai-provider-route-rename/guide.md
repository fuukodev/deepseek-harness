---
kind: upgrade-guide
description: "The pi-ai Azure provider route is renamed from `azure-openai-responses` to `azure`, so an `llm-pi-ai` settings entry under the old key stops resolving."
---

# `azure` replaces `azure-openai-responses` as the Azure provider route

English | [中文](guide.zh.md)

## Change

The bundled pi-ai catalog renames its Azure provider route from `azure-openai-responses` to `azure` (pi-ai 1.1.0). The route is the key of the `llm-pi-ai` plugin's `providers` settings dict, so a profile stored under `azure-openai-responses` no longer matches a catalog route. A profile that relied on the catalog's Azure models fails at load with `resolves no models`; one that listed its own `models` keeps working but reports the old route name. Users who configured the Azure route are affected. The wire protocol name `azure-openai-responses` is unchanged, so a `compat` block or `api` override that uses it keeps working. The catalog also gains the `meta`, `radius`, and `typesafe` routes.

## Migration

1. Rename the route key in `settings.yaml`:

   ```yaml
   llm-pi-ai:
     providers:
       azure:  # was azure-openai-responses
         apiKeyEnv: AZURE_API_KEY
   ```

2. Run `dsh --dump-config --profile <name>` and confirm the profile resolves and prints `azure` among its provider routes.
