import React from 'react';
import { Article } from '../types';

interface ArticleListProps {
  articles: Article[];
  onView: (article: Article) => void;
}

const statusMap: Record<string, string> = {
  'Drafting': '執筆中',
  'Reviewing': 'レビュー中',
  'Approved': '承認済み',
  'Posted': '投稿済み',
  'Rejected': '却下'
};

const ArticleList: React.FC<ArticleListProps> = ({ articles, onView }) => {
  return (
    <div className="bg-white rounded-lg shadow border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
        <h2 className="text-lg font-bold text-slate-800">生成記事一覧</h2>
        <span className="text-sm text-slate-500 bg-slate-100 px-2 py-1 rounded-full">合計 {articles.length} 件</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-600">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3">ステータス</th>
              <th scope="col" className="px-6 py-3">スコア</th>
              <th scope="col" className="px-6 py-3">トピック / タイトル</th>
              <th scope="col" className="px-6 py-3">作成日時</th>
              <th scope="col" className="px-6 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {articles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">
                  生成された記事はまだありません。パイプラインを実行してコンテンツを作成してください。
                </td>
              </tr>
            ) : (
              articles.map((article) => (
                <tr key={article.id} className="bg-white border-b hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className={`
                      px-2.5 py-1 rounded-full text-xs font-medium
                      ${article.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : ''}
                      ${article.status === 'Reviewing' ? 'bg-yellow-100 text-yellow-800' : ''}
                      ${article.status === 'Drafting' ? 'bg-blue-100 text-blue-800' : ''}
                      ${article.status === 'Rejected' ? 'bg-red-100 text-red-800' : ''}
                      ${article.status === 'Posted' ? 'bg-indigo-100 text-indigo-800' : ''}
                    `}>
                      {statusMap[article.status] || article.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono font-bold">
                    {article.review ? (
                      <span className={article.review.score >= 80 ? 'text-emerald-600' : 'text-amber-600'}>
                        {article.review.score}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-900">{article.title || article.topic}</div>
                    <div className="text-xs text-slate-400 mt-1">{article.analysis_report?.direction || '初期化中...'}</div>
                  </td>
                  <td className="px-6 py-4">
                    {(() => {
                      const d = new Date(article.date);
                      const month = String(d.getMonth() + 1).padStart(2, '0');
                      const day = String(d.getDate()).padStart(2, '0');
                      const hour = String(d.getHours()).padStart(2, '0');
                      const min = String(d.getMinutes()).padStart(2, '0');
                      return `${month}/${day}-${hour}:${min}`;
                    })()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => onView(article)}
                      className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      詳細を見る
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ArticleList;