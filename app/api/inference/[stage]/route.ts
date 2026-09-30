import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SERVICE_URL = (
  process.env.SKINWISE_API_URL ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");

export async function POST(
  request: Request,
  { params }: { params: { stage: string } }
) {
  if (params.stage !== "skin" && params.stage !== "acne") {
    return NextResponse.json({ detail: "Unknown inference stage." }, { status: 404 });
  }

  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ detail: "Sign in to analyze a scan." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ detail: "The image upload is invalid." }, { status: 400 });
  }

  try {
    const upstream = await fetch(
      `${SERVICE_URL}/api/analyze/${params.stage}`,
      {
        method: "POST",
        body: form,
        cache: "no-store",
      }
    );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("SkinWISE FastAPI service request failed:", error);
    return NextResponse.json(
      { detail: "The SkinWISE AI service is unavailable. Start the FastAPI backend and retry." },
      { status: 503 }
    );
  }
}
