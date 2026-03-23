import { createClient } from '@supabase/supabase-js';

<<<<<<< HEAD
// Helper: Convert Base64 Data URI to Blob
const base64ToBlob = (base64Data: string): Blob => {
  const parts = base64Data.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
};

// Singleton Supabase client (initialized dynamically)
=======
>>>>>>> 61a12e74eeae36440e87a039e8fa3adbcece66ba
let supabaseInstance: any = null;

export const initSupabaseClient = (url: string, key: string) => {
  if (url && key) {
    supabaseInstance = createClient(url, key);
  }
};

export const uploadImageToStorage = async (imageData: string, path: string): Promise<string> => {
  if (!imageData || imageData.includes('placehold.co')) return imageData;

<<<<<<< HEAD
  if (!supabaseInstance) {
    console.warn("Supabase client not initialized. Image upload skipped.");
    return "";
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

    const { data, error } = await supabaseInstance.storage
      .from('images')
      .upload(path, blob, { contentType: blob.type, upsert: true });

    if (error) {
      console.error(`Upload failed:`, error.message);
      return "";
    }

    const { data: publicUrlData } = supabaseInstance.storage
      .from('images')
      .getPublicUrl(path);

    return publicUrlData.publicUrl;

  } catch (e) {
    console.error(`Storage Exception:`, e);
=======
  console.log(`[StorageService] Uploading image: path=${path}, dataLength=${imageData.length}, type=${imageData.startsWith('http') ? 'URL' : 'base64'}`);

  try {
    const response = await fetch('/api/storage/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData, path })
    });

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      try {
        const err = await response.json();
        errMsg = err.error || errMsg;
      } catch {
        errMsg = await response.text().catch(() => errMsg);
      }
      console.error(`[StorageService] Upload failed for ${path}: ${errMsg}`);
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
>>>>>>> 61a12e74eeae36440e87a039e8fa3adbcece66ba
    return "";
  }
};

export const uploadArticleImages = async (
  articleId: string,
  design: { thumbnail_base64?: string; section1_base64?: string; section2_base64?: string; section3_base64?: string }
): Promise<string[]> => {
<<<<<<< HEAD
  // Parallel uploads
=======
  console.log(`[StorageService] Starting batch upload for article: ${articleId}`);

>>>>>>> 61a12e74eeae36440e87a039e8fa3adbcece66ba
  const uploads = [
    design.thumbnail_base64 ? uploadImageToStorage(design.thumbnail_base64, `articles/${articleId}/thumbnail.png`) : Promise.resolve(""),
    design.section1_base64 ? uploadImageToStorage(design.section1_base64, `articles/${articleId}/section1.png`) : Promise.resolve(""),
    design.section2_base64 ? uploadImageToStorage(design.section2_base64, `articles/${articleId}/section2.png`) : Promise.resolve(""),
    design.section3_base64 ? uploadImageToStorage(design.section3_base64, `articles/${articleId}/section3.png`) : Promise.resolve("")
  ];
<<<<<<< HEAD
  return Promise.all(uploads);
};
=======

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
  imageModel?: string,
  arkApiKey?: string
): Promise<string[]> => {
  console.log(`[StorageService] Re-uploading images for article: ${articleId}, model: ${imageModel}`);

  const response = await fetch('/api/storage/reupload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articleId, designPrompts, imageModel, arkApiKey })
  });

  if (!response.ok) {
    let errMsg = 'Re-upload failed';
    try {
      const err = await response.json();
      errMsg = err.error || errMsg;
    } catch {
      errMsg = await response.text().catch(() => errMsg);
    }
    throw new Error(errMsg);
  }

  const data = await response.json();
  console.log(`[StorageService] Re-upload result:`, data.imageUrls);
  return data.imageUrls || [];
};
>>>>>>> 61a12e74eeae36440e87a039e8fa3adbcece66ba
