"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { SETTINGS_SCHEMA, updateSettings, type SettingKey } from "@/lib/config";
import { logAudit } from "@/lib/audit";

export type SettingsState = { error?: string; success?: boolean } | undefined;

export async function updateSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { error: "Forbidden" };
  }

  const input: Partial<Record<SettingKey, number>> = {};
  for (const key of Object.keys(SETTINGS_SCHEMA) as SettingKey[]) {
    const raw = formData.get(key);
    if (raw === null || raw === "") continue;
    input[key] = Number(raw);
  }

  try {
    await updateSettings(input);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save settings." };
  }

  await logAudit({
    actorUserId: session.sub,
    eventType: "SITE_SETTINGS_UPDATED",
    details: input,
  });

  revalidatePath("/admin/settings");
  return { success: true };
}
