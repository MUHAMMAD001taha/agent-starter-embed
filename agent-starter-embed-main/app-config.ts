import type { AppConfig } from './lib/types';

export const APP_CONFIG_DEFAULTS: AppConfig = {
  supportsChatInput: true,
  supportsVideoInput: true,
  supportsScreenShare: true,
  // Off: the buffered audio (a "hello?" before the agent joins) made the agent answer it
  // ("Ji, farmaiye") instead of starting every call with its greeting.
  isPreConnectBufferEnabled: false,
  // Must match agent_name in the backend's @server.rtc_session(agent_name=...)
  agentName: 'vidazin',
};
