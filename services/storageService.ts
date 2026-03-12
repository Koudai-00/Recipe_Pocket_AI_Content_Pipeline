import { createClient } from '@supabase/supabase-js';

// Singleton Supabase client (used for read operations only on the frontend)
let supabaseInstance: any = null;

export const initSupabaseClient = (url: string, key: string) => {
  if (url && key) {
    supabaseInstance = createClient(url, key);
  }
};

/**
 * Upload a single image via the backend API (which uses the Service Role Key,
 * bypassing Supabase Storage RLS policies).
 * imageData: Base64 data URI (e.g. "data:image/png;base64,...") OR a public http URL
 */
export const uploadImageToStorage = async (imageData: string, path: string): Promise<string> => {
  if (!imageData || imageData.includes('placehold.co')) return imageData;

  try {
    const response = await fetch('/api/storage/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData, path })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error(`Upload failed:`, err.error);
      return "";
    }

    const data = await response.json();
    return data.publicUrl || "";
  } catch (e) {
    console.error(`Storage Exception:`, e);
    return "";
  }
};

export const uploadArticleImages = async (
  articleId: string,
  design: { thumbnail_base64?: string; section1_base64?: string; section2_base64?: string; section3_base64?: string }
): Promise<string[]> => {
  const uploads = [
    design.thumbnail_base64 ? uploadImageToStorage(design.thumbnail_base64, `articles/${articleId}/thumbnail.png`) : Promise.resolve(""),
    design.section1_base64 ? uploadImageToStorage(design.section1_base64, `articles/${articleId}/section1.png`) : Promise.resolve(""),
    design.section2_base64 ? uploadImageToStorage(design.section2_base64, `articles/${articleId}/section2.png`) : Promise.resolve(""),
    design.section3_base64 ? uploadImageToStorage(design.section3_base64, `articles/${articleId}/section3.png`) : Promise.resolve("")
  ];
  return Promise.all(uploads);
};
