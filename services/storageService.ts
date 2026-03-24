import { createClient } from '@supabase/supabase-js';

// Helper: Convert Base64 Data URI to Blob
const base64ToBlob = (base64Data: string): Blob => {
  const parts = base64Data.split(';base64,');
  if (parts.length < 2) return new Blob();
  const contentType = parts[0].split(':')[1];
  const raw = atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
};
let supabaseInstance: any = null;

export const initSupabaseClient = (url: string, key: string) => {
  if (url && key) {
    supabaseInstance = createClient(url, key);
  }
};

export const uploadImageToStorage = async (imageData: string, path: string): Promise<string> => {
  if (!imageData || imageData.includes('placehold.co')) return imageData;

  if (!supabaseInstance) {
    console.log(`[StorageService] Supabase not initialized. Using Backend Proxy for ${path}...`);
    try {
      const response = await fetch('/api/storage/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData, path })
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      return data.publicUrl || "";
    } catch (e) {
      console.error(`[StorageService] Backend Upload failed for ${path}:`, e);
      return "";
    }
  }

  try {
    let blob: Blob;
    if (imageData.startsWith('http')) {
      const response = await fetch(imageData);
      if (!response.ok) throw new Error(`Failed to fetch external image`);
      blob = await response.blob();
    } else {
      blob = base64ToBlob(imageData);
    }

    const { error } = await supabaseInstance.storage
      .from('images')
      .upload(path, blob, { contentType: blob.type, upsert: true });

    if (error) {
      console.warn(`[StorageService] Client upload failed for ${path}: ${error.message}. Falling back to Backend Proxy...`);
      // If client upload fails (e.g., RLS), try backend proxy before giving up
      return await uploadViaBackendProxy(imageData, path);
    }

    const { data: publicUrlData } = supabaseInstance.storage
      .from('images')
      .getPublicUrl(path);

    return publicUrlData.publicUrl;
  } catch (e) {
    console.error(`[StorageService] Client Exception during upload of ${path}:`, e);
    // Final fallback attempt
    return await uploadViaBackendProxy(imageData, path);
  }
};

// Helper to call backend upload proxy
const uploadViaBackendProxy = async (imageData: string, path: string): Promise<string> => {
  try {
    console.log(`[StorageService] Attempting Backend Proxy upload for ${path}...`);
    const response = await fetch('/api/storage/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData, path })
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    return data.publicUrl || "";
  } catch (e) {
    console.error(`[StorageService] Backend Proxy Upload reached final failure for ${path}:`, e);
    return "";
  }
};

export const uploadArticleImages = async (
  articleId: string,
  design: { thumbnail_base64?: string; section1_base64?: string; section2_base64?: string; section3_base64?: string }
): Promise<string[]> => {
  console.log(`[StorageService] Starting batch upload for article: ${articleId}`);
  const uploads = [
    design.thumbnail_base64 ? uploadImageToStorage(design.thumbnail_base64, `articles/${articleId}/thumbnail.png`) : Promise.resolve(""),
    design.section1_base64 ? uploadImageToStorage(design.section1_base64, `articles/${articleId}/section1.png`) : Promise.resolve(""),
    design.section2_base64 ? uploadImageToStorage(design.section2_base64, `articles/${articleId}/section2.png`) : Promise.resolve(""),
    design.section3_base64 ? uploadImageToStorage(design.section3_base64, `articles/${articleId}/section3.png`) : Promise.resolve("")
  ];
  const results = await Promise.all(uploads);
  const successCount = results.filter(url => url && url.length > 0).length;
  console.log(`[StorageService] Batch upload complete: ${successCount}/4 images uploaded for article ${articleId}`);
  return results;
};

export const reuploadArticleImages = async (
  articleId: string,
  designPrompts: { thumbnail_prompt?: string; section1_prompt?: string; section2_prompt?: string; section3_prompt?: string },
  imageModel?: string,
  arkApiKey?: string
): Promise<string[]> => {
  console.log(`[StorageService] Re-uploading images for article: ${articleId}, model: ${imageModel}`);

  const response = await fetch('/api/storage/reupload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articleId, designPrompts, imageModel, arkApiKey })
  });

  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return data.imageUrls || [];
};
