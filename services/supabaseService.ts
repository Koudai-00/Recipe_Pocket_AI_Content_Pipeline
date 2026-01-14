import { createClient } from '@supabase/supabase-js';
import { Article, ArticleContent } from '../types';

/**
 * Inserts a new article into the 'posts' table in Supabase.
 */
export const postToSupabase = async (
  article: Omit<Article, 'content'> & { content: string | ArticleContent }, 
  url: string, 
  key: string, 
  authorId: string
): Promise<string> => {
  if (!url || !key) {
    throw new Error("Supabase credentials (URL or Key) are missing in settings.");
  }

  const supabase = createClient(url, key);

  // Determine content string
  let contentToPost = "";
  if (typeof article.content === 'string') {
      contentToPost = article.content;
  } else {
      contentToPost = `${article.content.body_p1}\n\n${article.content.body_p2}\n\n${article.content.body_p3}`;
  }

  // PRIORITIZE uploaded URL over Base64 string
  // article.image_urls[0] is the thumbnail URL from storageService
  const thumbnailUrl = (article.image_urls && article.image_urls.length > 0 && article.image_urls[0])
    ? article.image_urls[0] 
    : (article.design?.thumbnail_base64 || null);

  const { data, error } = await supabase
    .from('posts')
    .insert([
      {
        title: article.title,
        content: contentToPost,
        status: 'published',
        thumbnail_url: thumbnailUrl,
        author_id: authorId || undefined,
        created_at: new Date().toISOString(),
        // Default fields
        view_count: 0,
        is_featured: false
      }
    ])
    .select();

  if (error) {
    console.error("Supabase Insert Error:", error);
    throw new Error(`Supabase Error: ${error.message}`);
  }

  return data?.[0]?.id || 'unknown-id';
};