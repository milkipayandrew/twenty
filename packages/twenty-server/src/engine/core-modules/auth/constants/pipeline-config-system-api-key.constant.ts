// Well-known sentinel `jti` for the appraisal pipeline-config SYSTEM read principal.
//
// The appraisal worker/logic-fn must read a freshly-provisioned workspace's per-workspace
// `pipelineConfig` record, but a brand-new tenant has no core.apiKey row the read could reference —
// and validateAPIKey 403s any jti that is not a real apiKey row in the token's workspace. Rather than
// pre-seeding a per-workspace key, the resolver mints a bearer from the instance-master APP_SECRET
// whose `jti` is this constant. The signature is still verified for THAT workspace
// (sha256hex(APP_SECRET + workspaceId + "API_KEY")), so only a holder of APP_SECRET can present it —
// trust equals instance-master. validateAPIKey recognises this sentinel and authenticates the read
// WITHOUT an apiKeyMap lookup; the api-key role resolver maps it to the workspace Admin role.
//
// This value MUST stay in lockstep with `PIPELINE_CONFIG_SYSTEM_API_KEY_ID` in the appraisal-app
// resolver (twenty/apps/appraisal-app/src/logic-functions/resolve-pipeline-config.ts).
export const PIPELINE_CONFIG_SYSTEM_API_KEY_ID =
  '20202020-cf16-4e5a-b1d0-c0f16c0f16c0';

// The synthetic system apiKey never expires (it is re-minted per read, short-TTL, on the client side).
export const PIPELINE_CONFIG_SYSTEM_API_KEY_EXPIRES_AT = '9999-12-31T23:59:59.000Z';
