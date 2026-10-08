import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireDoctor() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/doctor/login?redirectTo=%2Fdoctor");
  }

  const { data: doctor, error } = await supabase
    .from("doctors")
    .select("id, name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not verify doctor access: ${error.message}`);
  }

  if (!doctor) {
    redirect("/doctor/login?error=access_denied");
  }

  return { doctor, user };
}
