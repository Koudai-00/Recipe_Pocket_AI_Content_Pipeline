import { createClient } from '@supabase/supabase-js';

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
let supabaseInstance: any = null;

export const initSupabaseClient = (url: string, key: string) => {
    if (url && key) {
        supabaseInstance = createClient(url, key);
    }
};

export const uploadImageToStorage = async (imageData: string, path: string): Promise<string> => {
  if (!imageData || imageData.includes('placehold.co')) return imageData;
  
  if (!supabaseInstance) {
      console.warn("Supabase client not initialized. Image upload skipped.");
      return imageData;
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
      return imageData;
    }

    const { data: publicUrlData } = supabaseInstance.storage
      .from('images')
      .getPublicUrl(path);

    return publicUrlData.publicUrl;

  } catch (e) {
    console.error(`Storage Exception:`, e);
    return imageData;
  }
};

export const uploadArticleImages = async (
  articleId: string, 
  design: { thumbnail_base64?: string; section1_base64?: string; section2_base64?: string; section3_base64?: string }
): Promise<string[]> => {
  // Parallel uploads
  const uploads = [
    design.thumbnail_base64 ? uploadImageToStorage(design.thumbnail_base64, `articles/${articleId}/thumbnail.png`) : Promise.resolve(""),
    design.section1_base64 ? uploadImageToStorage(design.section1_base64, `articles/${articleId}/section1.png`) : Promise.resolve(""),
    design.section2_base64 ? uploadImageToStorage(design.section2_base64, `articles/${articleId}/section2.png`) : Promise.resolve(""),
    design.section3_base64 ? uploadImageToStorage(design.section3_base64, `articles/${articleId}/section3.png`) : Promise.resolve("")
  ];
  return Promise.all(uploads);
};