---
chunking: dxAICHAT
doc-meta:
  commit: fcefd2e
sources:
  - file: ai-chat/services/chat-execution.service.ts
    prefix: CHATEXEC
    type: raw
  - file: ai-chat/resolvers/agent-chat.resolver.ts
    prefix: RESOLVER
    type: raw
  - file: ai-chat/resolvers/agent-chat-subscription.resolver.ts
    prefix: SUBRESOLVER
    type: raw
  - file: ai-chat/services/agent-chat-streaming.service.ts
    prefix: STREAMSVC
    type: raw
  - file: ai-chat/jobs/stream-agent-chat.job.ts
    prefix: STREAMJOB
    type: raw
  - file: ai-chat/services/agent-title-generation.service.ts
    prefix: TITLEGEN
    type: raw
  - file: ai-models/services/sdk-provider-factory.service.ts
    prefix: SDKFACTORY
    type: raw
  - file: ai-models/constants/ai-sdk-package.const.ts
    prefix: SDKPKG
    type: raw
  - file: ai-models/services/ai-model-registry.service.ts
    prefix: REGISTRY
    type: raw
  - file: ai-models/services/provider-config.service.ts
    prefix: PROVCONFIG
    type: raw
  - file: ai-models/services/default-ai-catalog.service.ts
    prefix: CATALOG
    type: raw
  - file: ai-models/services/native-tool-binder.service.ts
    prefix: NATIVETOOL
    type: raw
  - file: ai-agent-execution/services/agent-async-executor.service.ts
    prefix: ASYNCEXEC
    type: raw
---

# Twenty AI Chat Backend — LLM Invocation Path & Provider Extension Points

Diagnosis cache for the AI chat backend under
`packages/twenty-server/src/engine/metadata-modules/ai/`. Covers how a chat
message reaches an LLM, how models/providers are constructed via the Vercel AI
SDK, and where a non-API (e.g. CLI subprocess) backend could be swapped in.

All `file:line` references are to **source** (never `dist/`). Paths are given
relative to the `ai/` module directory unless noted. Verified against commit
`fcefd2e`.

Cross-reference: the agent-run/turn side of the same SDK stack is documented in
`twenty/apps/agents/docs.agents.md` (the SDK app), and this module reuses shared
types from `twenty-shared/ai`.

---

<!--dxAICHAT00001:CHATEXEC&REGISTRY&SDKFACTORY-->
## 1. LLM invocation core (Vercel AI SDK)

The backend does **not** talk to any provider HTTP API directly. Every LLM call
goes through the **Vercel AI SDK** (`import ... from 'ai'`), which owns the wire
protocol, streaming, tool-call loop, and provider adapters.

**The main chat call** is `streamText(...)` in
`ai-chat/services/chat-execution.service.ts:440`. The key arguments:

- `model: registeredModel.model` (`chat-execution.service.ts:441`) — a
  `LanguageModel` instance produced by the registry (see chunk 3), not a string.
- `messages: [systemMessage, ...modelMessages]` (`:442`) — system prompt +
  pruned conversation.
- `tools: activeTools` (`:443`) — the `ToolSet` assembled at `:217` (see chunk 5).
- `stopWhen` (`:445-448`) — stops on `AGENT_CONFIG.MAX_STEPS`, on an
  `ask_questions` tool call, or when credits run out.
- `providerOptions` / `prepareStep` / `experimental_repairToolCall` (`:459-592`)
  — provider-specific cache breakpoints, tool-call repair, telemetry.

`streamChat(...)` (`chat-execution.service.ts:123-611`) is the single method that
builds the request and returns `{ stream, modelConfig, hasNoMoreAvailableCredits }`
(`ChatExecutionResult`, declared `:98-102`; the `stream` field is typed
`ReturnType<typeof streamText>`, `:99`). Token accounting, billing, and metrics
are wired via `streamText` callbacks (`onChunk`, `onStepFinish`, `onAbort`,
`:471-571`) plus a post-hoc `Promise.all([stream.usage, stream.steps])` at
`:595-604`.

**Other AI-SDK call sites in this module** (all resolve `model:` from the same
registry, so swapping the registry's model construction affects all of them):

| Call | File:line | SDK fn |
|------|-----------|--------|
| Chat streaming (primary) | `ai-chat/services/chat-execution.service.ts:440` | `streamText` |
| Chat thread title | `ai-chat/services/agent-title-generation.service.ts:46` (`model: defaultModel.model`, `:47`) | `generateText` |
| Workflow agent run | `ai-agent-execution/services/agent-async-executor.service.ts:232` and `:337` (`model: registeredModel.model`, `:235`) | `generateText` |
| Agent turn grader | `ai-agent-monitor/services/agent-turn-grader.service.ts:84` | `generateText` |
| Tool-call repair | `ai-agent/utils/repair-tool-call.util.ts:68` | `generateText` |
| Raw generate-text endpoint | `ai-generate-text/controllers/ai-generate-text.controller.ts:70` | `generateText` |
<!--/dxAICHAT00001-->

<!--dxAICHAT00002:SDKFACTORY&SDKPKG-->
## 2. Provider / model construction (the abstraction seam)

`ai-models/services/sdk-provider-factory.service.ts` is where an
`AiProviderConfig` becomes a live AI-SDK provider. This is the **narrowest
seam** in the whole stack — everything above it consumes a `LanguageModel`.

**Key type** — `AiSdkProviderInstance` (`sdk-provider-factory.service.ts:32-36`):

```ts
export type AiSdkProviderInstance = {
  createModel: (modelId: string) => LanguageModel;  // the abstraction
  rawProvider: unknown;
  sdkPackage: AiSdkPackage;
};
```

`createModel(modelId) => LanguageModel` is the closure the registry calls to mint
each model. Whatever object it returns is what `streamText`/`generateText`
receive as `model:`.

**The dispatch switch** — `buildProviderInstance(config)`
(`sdk-provider-factory.service.ts:91-116`) switches on `config.npm` (the SDK
package id) and calls the matching `@ai-sdk/*` factory:

| `config.npm` constant | Value (`ai-sdk-package.const.ts`) | Builder (`sdk-provider-factory.service.ts`) | AI-SDK factory |
|---|---|---|---|
| `AI_SDK_OPENAI` | `@ai-sdk/openai` (`:1`) | `buildStandardProvider` (`:95`) | `createOpenAI` |
| `AI_SDK_ANTHROPIC` | `@ai-sdk/anthropic` (`:2`) | `buildStandardProvider` (`:97`) | `createAnthropic` |
| `AI_SDK_GOOGLE` | `@ai-sdk/google` (`:3`) | `buildStandardProvider` + Gemini middleware (`:99`) | `createGoogleGenerativeAI` |
| `AI_SDK_MISTRAL` | `@ai-sdk/mistral` (`:4`) | `buildStandardProvider` (`:103`) | `createMistral` |
| `AI_SDK_XAI` | `@ai-sdk/xai` (`:5`) | `buildXaiProvider` (`:105`) | `createXai` (`.responses(id)`, `:148`) |
| `AI_SDK_BEDROCK` | `@ai-sdk/amazon-bedrock` (`:6`) | `buildBedrockProvider` (`:107`) | `createAmazonBedrock` |
| `AI_SDK_OPENAI_COMPATIBLE` | `@ai-sdk/openai-compatible` (`:7`) | `buildOpenAiCompatibleProvider` (`:109`) | `createOpenAICompatible` |
| `AI_SDK_AZURE` | `@ai-sdk/azure` (`:8`) | `buildAzureProvider` (`:111`) | `createAzure` |
| _unknown_ | — | `throw` (`:113-114`) | — |

**The `openai-compatible` branch is the pre-built bring-your-own-endpoint hook.**
`buildOpenAiCompatibleProvider` (`:192-210`) *requires* `config.baseUrl` (throws
if absent, `:195-196`) and calls `createOpenAICompatible({ name, baseURL, apiKey
})` (`:199-203`). Any server that speaks the OpenAI Chat Completions wire format
at that `baseUrl` is usable with zero code changes (see chunk 7, Option C).

`buildStandardProvider` (`:118-139`) also passes `config.baseUrl` through as
`baseURL` when present (`:125`), so OpenAI/Anthropic/etc. can already be pointed
at a proxy. Instances are cached per provider name in
`createProvider` → `providerInstances` map (`:40-57`); `clearCache()` (`:87-89`)
is called on registry rebuild.
<!--/dxAICHAT00002-->

<!--dxAICHAT00003:REGISTRY&PROVCONFIG&CATALOG-->
## 3. Model registry (config → ready-to-use models)

`ai-models/services/ai-model-registry.service.ts` turns provider config into a
map of ready `LanguageModel`s and resolves which one a chat/agent should use.

**Key type** — `RegisteredAiModel` (`ai-model-registry.service.ts:38-45`):
`{ modelId, sdkPackage, model: LanguageModel, supportsReasoning?, providerName?,
modelsDevName? }`. The `model` field is the `LanguageModel` consumed by
`streamText`.

**Build path:**

- `ensureFresh()` (`:68-79`) rebuilds lazily when the `LLM` config-group hash
  changes — no explicit refresh needed after a config var mutation.
- `buildModelRegistry()` (`:81-90`) clears caches, calls
  `providerConfigService.getResolvedProviders()`, then
  `registerModelsFromProviders(providers)`.
- `registerModelsFromProviders(...)` (`:92-136`) iterates providers; for each
  configured provider it calls
  `sdkProviderFactory.createProvider(providerKey, config)` (`:108`), then for
  each model definition sets
  `model: sdkInstance.createModel(modelDef.name)` (`:128`) into `modelRegistry`.
  This is where chunk 2's `createModel` closure is invoked.
- `resolveModelForAgent(agent)` (`:409-424`) — resolves an effective model id
  (falling back to `AUTO_SELECT_SMART_MODEL_ID`), looks it up via `getModel`,
  and throws `API_KEY_NOT_CONFIGURED` if the provider isn't configured. This is
  what `chat-execution.service.ts:183-186` calls
  (`resolveModelForAgent({ modelId: resolvedModelId })`) to obtain
  `registeredModel`.
- `getEffectiveModelConfig(modelId)` (`:232-263`) returns the non-live
  `AiModelConfig` (pricing, context window, modalities), used for billing and
  pruning.

**Config sourcing** — `ProviderConfigService.getResolvedProviders()`
(`provider-config.service.ts:24-32`) merges two sources:

1. The **committed catalog** `ai-models/ai-providers.json`, loaded by
   `DefaultAiCatalogService.getDefaultAiCatalog()`
   (`default-ai-catalog.service.ts:5` import, `:47` getter). `{{VAR}}` templates
   in the catalog are resolved against config vars / `process.env`
   (`provider-config.service.ts:34-81`).
2. The **`AI_PROVIDERS` config variable** (`provider-config.service.ts:29`),
   declared `AI_PROVIDERS: AiProvidersConfig = {}` in
   `engine/core-modules/twenty-config/config-variables.ts:1708`. User/admin
   custom providers are spread **last** (`:31`, `{ ...catalog, ...custom }`), so
   they override catalog entries. Templates are deliberately **not** resolved in
   custom providers (comment at `:26-27`) to prevent config-var exfiltration.
<!--/dxAICHAT00003-->

<!--dxAICHAT00004:RESOLVER&STREAMSVC&STREAMJOB&SUBRESOLVER-->
## 4. End-to-end chat execution path

A chat message travels resolver → streaming service (BullMQ enqueue) → worker
job → `ChatExecutionService.streamChat` → `streamText`, and streams back out via
a GraphQL subscription over Redis pub/sub.

**4a. GraphQL entry** — `ai-chat/resolvers/agent-chat.resolver.ts`.
`sendChatMessage(...)` mutation (`agent-chat.resolver.ts:151-271`): validates
model availability (`:177-180`) and credits (`:182`), then either queues the
message (if a stream/question is already active, `:216-236`) or calls
`agentChatStreamingService.streamAgentChat({...})` (`:238-247`). Related
mutations: `retryChatMessage` (`:273`), `answerAgentChatQuestion` (`:316`),
`stopAgentChatStream` (`:376`, publishes `cancel` on the Redis cancel channel).

**4b. Enqueue** — `ai-chat/services/agent-chat-streaming.service.ts`.
`streamAgentChat(...)` (`:156-298`) claims the stream slot on the thread
(`tryClaimStream`, `:128-154`), persists the user message, then enqueues a
BullMQ job on the **`aiStreamQueue`**:
`messageQueueService.add<StreamAgentChatJobData>(STREAM_AGENT_CHAT_JOB_NAME, {...})`
(`:259-275`). The queue is injected via
`@InjectMessageQueue(MessageQueue.aiStreamQueue)` (`:63`). `retryLastFailedTurn`
(`:300`), `answerPendingQuestionAndResumeStream` (`:428`), and
`flushNextQueuedMessage` (`:542`) enqueue the same job name for their variants.

**4c. Worker job** — `ai-chat/jobs/stream-agent-chat.job.ts`. `StreamAgentChatJob`
is a `@Processor({ queueName: MessageQueue.aiStreamQueue, scope: Scope.REQUEST })`
(`:58`). `handle(...)` (`:76-226`) re-checks the stream claim, wires an
`AbortController` to the Redis cancel channel (`:109-131`), then calls
`executeStream` → `buildAndPublishStream`. Inside `buildAndPublishStream`
(`:270-551`) it wraps everything in `createUIMessageStream` (`:342`) whose
`execute` calls `chatExecutionService.streamChat({...})` (`:362-376`) and merges
the model stream via **`stream.toUIMessageStream({...})`** (`:391-445`) — the
adapter from the AI-SDK `streamText` result to Twenty's UI message chunks. The
UI stream is `tee()`'d (`:457`) into a checkpoint-persist path (`:459-501`) and a
publish path (`:505-549`).

**4d. Fan-out to clients** — the publish path calls
`eventPublisherService.publish({ ... event: { type: 'stream-chunk', chunk } })`
(`stream-agent-chat.job.ts:512-519`) for each chunk. Clients receive these over
the GraphQL subscription `onAgentChatEvent`
(`ai-chat/resolvers/agent-chat-subscription.resolver.ts:40-101`), which is backed
by `subscriptionService.subscribeToAgentChat(...)` (`:66`) over Redis pub/sub.
On reconnect, the client calls the `chatStreamCatchupChunks` query
(`agent-chat.resolver.ts:102-138`) which returns accumulated chunks +
`maxSeq` from `eventPublisherService.getAccumulatedChunks(threadId)` (`:125-126`)
and reaps dead streams.
<!--/dxAICHAT00004-->

<!--dxAICHAT00005:CHATEXEC&NATIVETOOL-->
## 5. Tools passed to the model

The model can call tools; the `ToolSet` handed to `streamText` is assembled in
`chat-execution.service.ts`.

- **`activeTools: ToolSet`** — built at `chat-execution.service.ts:217-240`. It
  spreads `directTools` (preloaded registry tools + native provider tools, built
  `:204-207`) and adds four meta-tools:
  - `ask_questions` — `createAskQuestionsTool()` (`:219`), name
    `ASK_QUESTIONS_TOOL_NAME`; hitting it stops the step loop (`:447`).
  - `learn_tools` — `createLearnToolsTool(toolRegistry, ...)` (`:220`); returns
    tool schemas as text.
  - `execute_tool` — `createExecuteToolTool(toolRegistry, ...)` (`:224`);
    dispatches a discovered tool through the registry.
  - `load_skill` — `createLoadSkillTool(...)` (`:229`); loads skill definitions
    via `SkillService`.
- **Registry** — `ToolRegistryService`
  (`engine/core-modules/tool-provider/services/tool-registry.service.ts`),
  injected `chat-execution.service.ts:109`. `buildToolIndex` (`:156`) builds the
  catalog; `getToolsByName(AI_CHAT_TOOL_NAMES_TO_PRELOAD, ...)` (`:170-174`)
  preloads the always-on tools. The `execute_tool`/`learn_tools` indirection
  keeps the up-front `ToolSet` small while exposing the full catalog on demand.
- **Native provider tools** — `NativeToolBinderService`
  (`ai-models/services/native-tool-binder.service.ts:11-20`); `.bind(model,
  {...})` (`:14`) delegates to `AiModelConfigService.getNativeModelTools`. Called
  at `chat-execution.service.ts:196-199` for provider-native web/twitter search
  (opaque, never serialized). Capabilities gated by
  `getNativeModelCapabilities(registeredModel.sdkPackage)` (`:193`).

The `ToolSet` is documented as **constant for the whole conversation** — no
mutation mid-turn (comment `:215-216`).
<!--/dxAICHAT00005-->

<!--dxAICHAT00006:CHATEXEC&STREAMJOB-->
## 6. What a "turn" actually returns

`streamChat` returns the *live* `streamText` result, not a finished string
(`chat-execution.service.ts:606-610`). The worker adapts it with
`stream.toUIMessageStream(...)` (`stream-agent-chat.job.ts:391`) whose callbacks
drive persistence and billing:

- `onFinish` (`stream-agent-chat.job.ts:416-443`) → `handleStreamFinish`
  (`:641-772`) persists the assistant message and updates thread token/credit
  totals.
- `messageMetadata` (`:399-415`) → `computeMessageMetadata` (`:553-639`) computes
  per-step usage and cost from the model config.
- Token/billing accounting also happens inside `streamChat` itself via
  `emitTurnUsageEvent` (`chat-execution.service.ts:337-438`) and
  `onStepFinish`'s `decrementAndCheckAvailableCredits` (`:507-517`).

Implication for a replacement backend: whatever you substitute for `model:` must
produce an AI-SDK-compatible streaming result (v5 `LanguageModel` streaming
protocol: `text-delta`, `tool-call`, `finish-step`, `finish`, usage in
`LanguageModelUsage` shape) or these callbacks silently mis-account.
<!--/dxAICHAT00006-->

<!--dxAICHAT00007:SDKFACTORY&REGISTRY&CHATEXEC-->
## 7. Extension points — swapping in a non-API (CLI subprocess) backend

Three ways to route chat through something other than a hosted provider API,
ordered by decreasing invasiveness. All three ultimately supply a different
`model:` (or bypass `streamText`).

**Option A — new provider case in the SDK factory (recommended for a real
custom model).** Add a package-id constant to `ai-sdk-package.const.ts`, a
`case` in `buildProviderInstance` (`sdk-provider-factory.service.ts:94-115`), and
a builder returning an `AiSdkProviderInstance` whose `createModel(modelId)`
yields a **custom `LanguageModel` implementation** that shells out to a CLI
subprocess and adapts stdout to the AI-SDK v5 streaming protocol. Register the
provider in `ai-providers.json` (or `AI_PROVIDERS`). Nothing above the factory
changes — chat, agents, title-gen, grader all pick it up because they consume
`RegisteredAiModel.model`. This is the cleanest seam; cost is implementing the
`LanguageModelV2`-shaped adapter (streaming parts + usage).

**Option B — branch inside `ChatExecutionService.streamChat`.** Intercept at
`chat-execution.service.ts` around the `streamText` call (`:440`): when
`registeredModel` matches a sentinel, build a custom `ReturnType<typeof
streamText>`-compatible object from a subprocess instead of calling `streamText`.
Faster to prototype but you must reproduce the full result surface the worker
relies on (`toUIMessageStream`, `usage`, `steps`; chunk 6) and it only affects
chat — agent/title/grader paths (chunk 1) still hit `streamText`. Higher long-term
maintenance.

**Option C — `openai-compatible` provider, zero code.** Stand up a local server
that speaks the OpenAI Chat Completions wire format in front of your CLI backend,
then add a provider entry with `npm: '@ai-sdk/openai-compatible'` and
`baseUrl: 'http://localhost:PORT'` (via `AI_PROVIDERS` or `ai-providers.json`).
`buildOpenAiCompatibleProvider` (`sdk-provider-factory.service.ts:192-210`) wires
it with **no code change**. Best for fast integration if your backend can front
an OpenAI-compatible HTTP shim (e.g. Ollama, llama.cpp server, LiteLLM proxy).

**Caveat — tool-system impedance mismatch (applies to all three).** The chat
loop leans hard on tool-calling: `activeTools` with `execute_tool`/`learn_tools`/
`load_skill`/`ask_questions` (chunk 5), `experimental_repairToolCall`
(`chat-execution.service.ts:572-592`), `stopWhen: hasToolCall(...)` (`:447`), and
provider-native tools (chunk 5). A CLI/local model that cannot emit structured
tool calls in the AI-SDK format will break the agentic loop — the meta-tools
never fire, `ask_questions` can't pause the turn, and metrics/billing that key
off tool-result parts (`onStepFinish`, `:535-567`) go quiet. An OpenAI-compatible
shim (Option C) must faithfully implement `tools`/`tool_calls`; a bespoke adapter
(Option A) must map subprocess output onto AI-SDK `tool-call`/`tool-result`
stream parts. If tool-calling isn't feasible, the realistic use is a
**tool-less** secondary model role (e.g. title generation,
`agent-title-generation.service.ts:46`, which passes no `tools`), not the primary
chat agent.
<!--/dxAICHAT00007-->

---

## Quick reference — canonical file:line anchors

| What | Where |
|------|-------|
| Primary chat `streamText` | `ai-chat/services/chat-execution.service.ts:440` |
| `model:` fed to streamText | `ai-chat/services/chat-execution.service.ts:441` (`registeredModel.model`) |
| `activeTools` ToolSet | `ai-chat/services/chat-execution.service.ts:217` |
| Provider switch | `ai-models/services/sdk-provider-factory.service.ts:91-116` |
| `openai-compatible` builder | `ai-models/services/sdk-provider-factory.service.ts:192-210` |
| `createModel` abstraction type | `ai-models/services/sdk-provider-factory.service.ts:32-36` |
| SDK package id constants | `ai-models/constants/ai-sdk-package.const.ts:1-8` |
| Registry model construction | `ai-models/services/ai-model-registry.service.ts:128` |
| `resolveModelForAgent` | `ai-models/services/ai-model-registry.service.ts:409-424` |
| Config merge (catalog + `AI_PROVIDERS`) | `ai-models/services/provider-config.service.ts:24-32` |
| `AI_PROVIDERS` config var | `engine/core-modules/twenty-config/config-variables.ts:1708` |
| `sendChatMessage` mutation | `ai-chat/resolvers/agent-chat.resolver.ts:151` |
| BullMQ enqueue | `ai-chat/services/agent-chat-streaming.service.ts:259` |
| Worker job / `toUIMessageStream` | `ai-chat/jobs/stream-agent-chat.job.ts:391` |
| Subscription fan-out | `ai-chat/resolvers/agent-chat-subscription.resolver.ts:40` |
| Reconnect catch-up | `ai-chat/resolvers/agent-chat.resolver.ts:102-138` |
</content>
</invoke>
