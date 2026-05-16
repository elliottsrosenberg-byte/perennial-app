// Thin TypeScript wrappers around the SECURITY DEFINER vault RPCs
// (`integration_set_secret`, `integration_read_secret`,
// `integration_delete_secrets`). All three functions run as the
// authenticated user and re-check auth.uid() against the integration's
// user_id, so callers can use the standard server-side Supabase client.
// No service-role key is needed in the Next.js process.

import { createClient } from "@/lib/supabase/server";

type SecretKind = "access_token" | "refresh_token";

export async function setIntegrationSecret(
  integrationId: string,
  kind: SecretKind,
  value: string,
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("integration_set_secret", {
    p_integration_id: integrationId,
    p_kind:           kind,
    p_value:          value,
  });
  if (error) throw new Error(`vault.setSecret(${kind}): ${error.message}`);
  return data as string;
}

export async function readIntegrationSecret(
  integrationId: string,
  kind: SecretKind,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("integration_read_secret", {
    p_integration_id: integrationId,
    p_kind:           kind,
  });
  if (error) throw new Error(`vault.readSecret(${kind}): ${error.message}`);
  return (data as string | null) ?? null;
}

export async function deleteIntegrationSecrets(integrationId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("integration_delete_secrets", {
    p_integration_id: integrationId,
  });
  if (error) throw new Error(`vault.deleteSecrets: ${error.message}`);
}
