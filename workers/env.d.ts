// Lo que `wrangler types` no puede ver y por eso no está en
// worker-configuration.d.ts (ese archivo se regenera: no lo edites a mano).
//
// - Los secretos (`wrangler secret put`): no están en wrangler.toml y no hay
//   .dev.vars en el repo. Si se añade uno nuevo, se declara aquí.
// - La forma del RPC de Mirai Assistant: wrangler solo sabe que MIRAI es un
//   Service, no qué métodos expone PersonajeRPC. Contrato completo en Mirai
//   Assistant: shared/asistente/personaje.ts.

interface MiraiPersonaje {
  identidad: string;
  conducta: string;
}

interface Env {
  DEEPSEEK_API_KEY: string;
  AI_GATEWAY_KEY: string;
  CF_ACCOUNT_ID: string;
  PRUNA_API_KEY: string;
  EXA_API_KEY: string;
  FIRECRAWL_API_KEY: string;
  GOOGLE_MAPS_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT?: string;

  MIRAI: Fetcher & { personaje(): Promise<MiraiPersonaje> };
}
