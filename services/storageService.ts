import { createClient } from '@supabase/supabase-js';

let supabaseInstance: any = null;

export const initSupabaseClient = (url: string, key: string) => {
  if (url && key) {
    supabaseInstance = createClient(url, key);
  }
};

export const uploadImageToStorage = async (imageData: string, path: string): Promise<string> => {
  if (!imageData || imageData.includes('placehold.co')) return imageData;

  console.log(`[StorageService] Uploading image: path=${path}, dataLength=${imageData.length}, type=${imageData.startsWith('http') ? 'URL' : 'base64'}`);

  try {
    const response = await fetch('/api/storage/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData, path })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error(`[StorageService] Upload failed for ${path}:`, err.error);
      return "";
    }

    const data = await response.json();
    const publicUrl = data.publicUrl || "";

    if (publicUrl) {
      console.log(`[StorageService] Upload success: ${path} -> ${publicUrl}`);
    } else {
      console.error(`[StorageService] Upload returned empty publicUrl for: ${path}`);
    }

    return publicUrl;
  } catch (e) {
    console.error(`[StorageService] Exception during upload of ${path}:`, e);
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
  const totalCount = [design.thumbnail_base64, design.section1_base64, design.section2_base64, design.section3_base64].filter(Boolean).length;
  console.log(`[StorageService] Batch upload complete: ${successCount}/${totalCount} images uploaded for article ${articleId}`);

  if (successCount < totalCount) {
    console.warn(`[StorageService] WARNING: ${totalCount - successCount} images failed to upload for article ${articleId}`);
  }

  return results;
};

export const reuploadArticleImages = async (
  articleId: string,
  designPrompts: { thumbnail_prompt?: string; section1_prompt?: string; section2_prompt?: string; section3_prompt?: string },
  imageModel?: string
): Promise<string[]> => {
  console.log(`[StorageService] Re-uploading images for article: ${articleId}`);

  const response = await fetch('/api/storage/reupload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articleId, designPrompts, imageModel })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Re-upload failed');
  }

  const data = await response.json();
  console.log(`[StorageService] Re-upload result:`, data.imageUrls);
  return data.imageUrls || [];
};
