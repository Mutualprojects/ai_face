import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Resilient Supabase Storage upload.
 *
 * If the storage bucket upload fails (e.g. RLS policy blocks the anon role —
 * "new row violates row-level security policy"), we fall back to returning the
 * original base64 data URL. The Flask backend already handles base64 photo URLs
 * (app.py -> img_from_photo_url -> base64_to_cv2), so registration still works.
 */
export async function uploadOrDataUrl(
  client: SupabaseClient,
  base64Str: string,
  path: string,
  contentType?: string
): Promise<{ url: string; usedStorage: boolean }> {
  const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (matches) {
    contentType = contentType || matches[1];
  }

  // Try to upload to Supabase Storage first.
  try {
    const { error } = await client.storage
      .from("face")
      .upload(path, Buffer.from(base64Str.split(",")[1] || "", "base64"), {
        contentType,
        upsert: true,
      });

    if (!error) {
      const { data: urlData } = client.storage.from("face").getPublicUrl(path);
      if (urlData?.publicUrl) {
        return { url: urlData.publicUrl, usedStorage: true };
      }
    } else {
      console.warn("[storage-upload] Bucket upload failed, falling back to data URL:", error.message);
    }
  } catch (err: any) {
    console.warn("[storage-upload] Bucket upload exception, falling back to data URL:", err?.message);
  }

  // Fallback: store the data URL directly. Works cross-host with Flask.
  return { url: base64Str, usedStorage: false };
}