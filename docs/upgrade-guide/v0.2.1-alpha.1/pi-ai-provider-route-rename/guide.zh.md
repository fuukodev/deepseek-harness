---
kind: upgrade-guide
description: "pi-ai 的 Azure 提供方路由由 `azure-openai-responses` 改名为 `azure`，因此以旧键存储的 `llm-pi-ai` 设置项不再解析。"
---

# Azure 提供方路由改名为 `azure`，不再使用 `azure-openai-responses`

[English](guide.md) | 中文

## 变更

随附的 pi-ai 目录将 Azure 提供方路由由 `azure-openai-responses` 改名为 `azure`（pi-ai 1.1.0）。该路由是 `llm-pi-ai` 插件 `providers` 设置字典的键，因此以 `azure-openai-responses` 存储的配置不再匹配任何目录路由。依赖目录中 Azure 模型的配置在加载时失败并报 `resolves no models`；自行列出 `models` 的配置仍可用，但显示旧路由名。受影响的是配置过 Azure 路由的用户。线协议名 `azure-openai-responses` 未变，因此使用该名的 `compat` 块或 `api` 覆盖仍然有效。目录还新增 `meta`、`radius` 和 `typesafe` 三个路由。

## 迁移

1. 在 `settings.yaml` 中重命名路由键：

   ```yaml
   llm-pi-ai:
     providers:
       azure:  # was azure-openai-responses
         apiKeyEnv: AZURE_API_KEY
   ```

2. 运行 `dsh --dump-config --profile <name>`，确认配置可解析且提供方路由中出现 `azure`。
