import { Article } from '../types';

/**
 * Helper: Convert JS Object to Firestore Value Format
 * We keep this logic on frontend to prepare the payload, but send it to backend to sign/execute.
 */
const toFirestoreValue = (value: any): any => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') {
      if (Number.isInteger(value)) return { integerValue: value };
      return { doubleValue: value };
  }
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === 'object') {
      const fields: any = {};
      for (const k in value) {
          if (Object.prototype.hasOwnProperty.call(value, k) && value[k] !== undefined) {
              fields[k] = toFirestoreValue(value[k]);
          }
      }
      return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
};

export const saveToFirestore = async (article: Article): Promise<void> => {
  // Format data on client side
  const firestoreFields = {
    date: article.date,
    status: article.status,
    analysis_report: article.analysis_report,
    marketing_strategy: article.marketing_strategy,
    content: article.content,
    image_urls: article.image_urls,
    review_score: article.review?.score || 0,
    review_comment: article.review?.comments || "",
    design_prompts: {
        thumbnail: article.design?.thumbnail_prompt,
        section1: article.design?.section1_prompt,
        section2: article.design?.section2_prompt,
        section3: article.design?.section3_prompt
    }
  };

  const documentBody = {
      fields: toFirestoreValue(firestoreFields).mapValue.fields
  };

  // Send to Backend
  const response = await fetch('/api/firestore/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
          documentId: article.id,
          documentBody: documentBody
      })
  });

  if (!response.ok) {
      const err = await response.json();
      throw new Error(`Firestore Save Error: ${err.error}`);
  }
};

export const updateFirestoreStatus = async (id: string, status: string): Promise<void> => {
  const response = await fetch('/api/firestore/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status })
  });

  if (!response.ok) {
      console.error("Failed to update status in Firestore");
  }
};