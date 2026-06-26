import { supabase } from "./supabase";
import type { ProfileInsert } from "@/types/database";
import type { TelegramUser } from "@/types/telegram";

/**
 * Sign in (or register) a user via their Telegram init data.
 *
 * Flow:
 *  1. Client sends the raw `initData` string from Telegram WebApp to a
 *     Supabase Edge Function (not yet built — placeholder here).
 *  2. Edge Function verifies the HMAC, creates/updates the profile row,
 *     and returns a Supabase custom JWT.
 *  3. Client calls supabase.auth.setSession() with that JWT.
 *
 * Replace the body of this function when the Edge Function is deployed.
 */
export async function signInWithTelegram(initData: string) {
  const { data, error } = await supabase.functions.invoke<{
    access_token: string;
    refresh_token: string;
  }>("telegram-auth", {
    body: { initData },
  });

  if (error) throw error;
  if (!data?.access_token || !data?.refresh_token) {
    throw new Error("No auth tokens returned from telegram-auth function");
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });

  if (sessionError) throw sessionError;
  if (!sessionData.session) throw new Error("Failed to establish session after sign-in");
  // onAuthStateChange in useAuth picks up the session from here — no need to call getUser()
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

// Syncs the latest Telegram user data into the profiles table.
// Called on every app open so username/photo changes are reflected immediately.
export async function syncProfile(telegramUser: TelegramUser) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const today = new Date().toISOString().slice(0, 10);

  await Promise.all([
    supabase.from("profiles").upsert(
      {
        id: user.id,
        telegram_id: telegramUser.id,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name ?? null,
        username: telegramUser.username ?? null,
        photo_url: telegramUser.photo_url ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    ),
    supabase.from("daily_opens").upsert(
      { user_id: user.id, day: today },
      { onConflict: "user_id,day", ignoreDuplicates: true },
    ),
  ]);
}

export async function upsertProfile(telegramUser: TelegramUser) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const payload: ProfileInsert = {
    id: user.id,
    telegram_id: telegramUser.id,
    username: telegramUser.username ?? null,
    first_name: telegramUser.first_name,
    last_name: telegramUser.last_name ?? null,
    photo_url: telegramUser.photo_url ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}
