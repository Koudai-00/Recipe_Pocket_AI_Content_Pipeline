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

/**
 * Helper: Convert Firestore Value Format to JS Object
 */
const fromFirestoreValue = (value: any): any => {
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.integerValue !== undefined) return parseInt(value.integerValue, 10);
    if (value.doubleValue !== undefined) return parseFloat(value.doubleValue);
    if (value.booleanValue !== undefined) return value.booleanValue;
    if (value.nullValue !== undefined) return null;
    if (value.arrayValue !== undefined) {
        return (value.arrayValue.values || []).map(fromFirestoreValue);
    }
    if (value.mapValue !== undefined) {
        const result: any = {};
        const fields = value.mapValue.fields || {};
        for (const k in fields) {
            result[k] = fromFirestoreValue(fields[k]);
        }
        return result;
    }
    return undefined;
};

export const fetchArticles = async (): Promise<Article[]> => {
    const response = await fetch('/api/firestore/articles');
    if (!response.ok) {
        throw new Error("Failed to fetch articles from backend");
    }

    const data = await response.json();
    const documents = data.documents || [];

    return documents.map((doc: any): Article => {
        const fields = doc.fields || {};

        // Parse fields using helper
        const parsed: any = {};
        for (const k in fields) {
            parsed[k] = fromFirestoreValue(fields[k]);
        }

        // Extract ID from document name: projects/.../databases/.../documents/articles/{id}
        const idFromPath = doc.name.split('/').pop();

        // Map parsed fields to Article interface with aggressive type assertion/fallbacks
        return {
            id: idFromPath, // Use ID from path
            date: parsed.date || doc.createTime || new Date().toISOString(),
            status: parsed.status || 'Draft',
            topic: parsed.topic || '', // New field mapping if exists, else from analysis

            content: parsed.content || { title: 'No Title', body_p1: '', body_p2: '', body_p3: '' },

            analysis_report: parsed.analysis_report || null,
            marketing_strategy: parsed.marketing_strategy || null,

            // Design: Parsed object needs to be mapped back to DesignPrompts structure if stored flat or nested
            design: {
                thumbnail_prompt: parsed.design_prompts?.thumbnail || "",
                section1_prompt: parsed.design_prompts?.section1 || "",
                section2_prompt: parsed.design_prompts?.section2 || "",
                section3_prompt: parsed.design_prompts?.section3 || "",
                // Base64s might not be stored efficiently in Firestore list if too large, 
                // but checking `saveToFirestore` we didn't save base64 strings explicitly in top level fields list?
                // Wait, `saveToFirestore` in line 32 includes `image_urls`.
                // Base64s were likely in `design` object if generated but `image_urls` used for storage links.
                // We'll rely on `image_urls` for display.
            },

            image_urls: parsed.image_urls || [],

            review: {
                status: 'REVIEW_REQUIRED',
                score: parsed.review_score || 0,
                comments: parsed.review_comment || ""
            },

            // Fallback for Title
            title: parsed.content?.title || parsed.marketing_strategy?.title || "Untitled"
        };
    }).sort((a: Article, b: Article) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const getDailyReport = async (date: string): Promise<any | null> => {
    try {
        const response = await fetch(`/api/firestore/reports/${date}`);
        if (response.status === 404) return null;

        const json = await response.json();
        if (!json.found || !json.data) return null;

        // Extract fields
        const fields = json.data.fields || {};
        const result: any = {};
        for (const k in fields) {
            result[k] = fromFirestoreValue(fields[k]);
        }
        return result;
    } catch (e) {
        console.warn("Error fetching daily report cache:", e);
        return null;
    }
};

export const saveDailyReport = async (date: string, data: any): Promise<void> => {
    // Convert to Firestore fields
    const firestoreFields = toFirestoreValue(data);
    // toFirestoreValue checks input type. If input is object, returns { mapValue: { fields: ... } }
    // We need just the fields object for the root document if using direct mapping, 
    // but our toFirestoreValue is recursive.
    // If we pass an object to toFirestoreValue, it returns { mapValue: { fields: ... } }
    // The API expects { fields: { ... } }.
    // So:

    // Safety check
    if (!firestoreFields.mapValue || !firestoreFields.mapValue.fields) {
        console.error("Invalid data structure for report save");
        return;
    }

    const documentBody = {
        fields: firestoreFields.mapValue.fields
    };

    await fetch('/api/firestore/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            date,
            documentBody
        })
    });
};

// --- Monthly Report Functions ---

export const fetchMonthlyReports = async (): Promise<any[]> => {
    try {
        const response = await fetch('/api/firestore/monthly_reports');
        if (!response.ok) return [];
        const json = await response.json();
        const documents = json.documents || [];

        return documents.map((doc: any) => {
            const fields = doc.fields || {};
            const result: any = {};
            for (const k in fields) {
                result[k] = fromFirestoreValue(fields[k]);
            }
            // ID
            result.id = doc.name.split('/').pop();
            return result;
        });
    } catch (e) {
        console.error("Failed to fetch monthly reports:", e);
        return [];
    }
};

export const saveMonthlyReportDoc = async (report: any): Promise<void> => {
    // Convert to Firestore fields
    const firestoreFields = toFirestoreValue(report);

    if (!firestoreFields.mapValue || !firestoreFields.mapValue.fields) {
        console.error("Invalid data structure for monthly report save");
        return;
    }

    try {
        await fetch('/api/firestore/monthly_reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                report: { id: report.id },
                documentBody: { fields: firestoreFields.mapValue.fields }
            })
        });
    } catch (e) {
        console.error("Failed to save monthly report:", e);
        throw e;
    }
};

export const deleteArticles = async (ids: string[]): Promise<void> => {
    try {
        const response = await fetch('/api/firestore/articles', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to delete articles');
        }
    } catch (e) {
        console.error("Failed to delete articles:", e);
        throw e;
    }
};