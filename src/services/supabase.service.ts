import { createClient } from "@supabase/supabase-js";

// Supabase client using service role key — server-side only
const getClient = () =>
  createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  );

const BUCKET = "documents";

// Upload a file buffer to Supabase Storage
// storagePath: e.g. "uid123/filename.pdf"
export const uploadToStorage = async (
  buffer: Buffer,
  storagePath: string,
  mimeType: string,
): Promise<string> => {
  const client = getClient();

  const { error } = await client.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  return storagePath;
};

// Generate a signed URL valid for 1 hour
export const getSignedUrl = async (storagePath: string): Promise<string> => {
  const client = getClient();

  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);

  if (error || !data?.signedUrl)
    throw new Error(`Failed to generate signed URL: ${error?.message}`);

  return data.signedUrl;
};

// Delete a file from storage
export const deleteFromStorage = async (storagePath: string): Promise<void> => {
  const client = getClient();

  const { error } = await client.storage.from(BUCKET).remove([storagePath]);

  if (error) throw new Error(`Storage delete failed: ${error.message}`);
};
