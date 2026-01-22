
import React, { useState, useMemo } from 'react';
import { Article } from '../types';

interface ArticleListProps {
  articles: Article[];
  onView: (article: Article) => void;
  onDelete?: (ids: string[]) => Promise<void>;
}

const statusMap: Record<string, string> = {
  'Drafting': '執筆中',
  'Reviewing': 'レビュー中',
  'Approved': '承認済み',
  'Posted': '投稿済み',
  'Rejected': '却下'
};

const ArticleList: React.FC<ArticleListProps> = ({ articles, onView, onDelete }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortOrder, setSortOrder] = useState<'date_desc' | 'date_asc' | 'score_desc'>('date_desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter and Sort Logic
  const filteredArticles = useMemo(() => {
    let result = [...articles];

    // Filter by Status
    if (filterStatus !== 'all') {
      result = result.filter(a => a.status === filterStatus);
    }

    // Filter by Search Query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(a =>
        (a.title || '').toLowerCase().includes(query) ||
        (a.topic || '').toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortOrder === 'date_desc') {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      } else if (sortOrder === 'date_asc') {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      } else {
        return (b.review?.score || 0) - (a.review?.score || 0);
      }
    });

    return result;
  }, [articles, searchQuery, filterStatus, sortOrder]);

  // Checkbox Logic
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredArticles.map(a => a.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleDeleteClick = async () => {
    if (!onDelete || selectedIds.size === 0) return;

    if (confirm(`選択した ${selectedIds.size} 件の記事を削除しますか？\n※システムデータベースから削除されますが、CMSへの投稿済み記事は削除されません。`)) {
      setIsDeleting(true);
      try {
        await onDelete(Array.from(selectedIds));
        setSelectedIds(new Set());
      } finally {
        setIsDeleting(false);
      }
    }
  };

  return (
    <div className="bg-white rounded-lg shadow border border-slate-200">

      {/* Header & Toolbar */}
      <div className="px-6 py-4 border-b border-slate-100 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800">生成記事一覧</h2>
          <span className="text-sm text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
            全 {articles.length} 件 / 表示 {filteredArticles.length} 件
          </span>
        </div>

        {/* Tools */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="flex items-center gap-2 w-full md:w-auto">
            {/* Search */}
            <div className="relative w-full md:w-64">
              <i className="fas fa-search absolute left-3 top-2.5 text-slate-400 text-sm"></i>
              <input
                type="text"
                placeholder="キーワード検索..."
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-full focus:outline-none focus:border-blue-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Status Filter */}
            <select
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:border-blue-500"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">全ステータス</option>
              <option value="Drafting">執筆中</option>
              <option value="Reviewing">レビュー中</option>
              <option value="Approved">承認済み</option>
              <option value="Posted">投稿済み</option>
              <option value="Rejected">却下</option>
            </select>

            {/* Sort */}
            <select
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:border-blue-500"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as any)}
            >
              <option value="date_desc">作成日 (新しい順)</option>
              <option value="date_asc">作成日 (古い順)</option>
              <option value="score_desc">スコア (高い順)</option>
            </select>
          </div>

          {/* Bulk Actions */}
          {selectedIds.size > 0 && (
            <button
              onClick={handleDeleteClick}
              disabled={isDeleting}
              className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors flex items-center gap-2 animate-fade-in"
            >
              {isDeleting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-trash"></i>}
              選択した {selectedIds.size} 件を削除
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-600">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3 w-4">
                <input
                  type="checkbox"
                  checked={filteredArticles.length > 0 && selectedIds.size === filteredArticles.length}
                  onChange={handleSelectAll}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th scope="col" className="px-6 py-3">ステータス</th>
              <th scope="col" className="px-6 py-3">スコア</th>
              <th scope="col" className="px-6 py-3">トピック / タイトル</th>
              <th scope="col" className="px-6 py-3">作成日時</th>
              <th scope="col" className="px-6 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredArticles.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-400 italic">
                  条件に一致する記事はありません。
                </td>
              </tr>
            ) : (
              filteredArticles.map((article) => (
                <tr key={article.id} className={`bg-white border-b hover:bg-slate-50 transition-colors ${selectedIds.has(article.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(article.id)}
                      onChange={() => handleSelectOne(article.id)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
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