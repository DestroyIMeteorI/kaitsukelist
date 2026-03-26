"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import Toast, { useToast } from "@/components/Toast";
import type { Item, EditableItemFields, UserWithStats } from "@/lib/types";
import { STATUS_MAP } from "@/lib/types";
import { supabase } from "@/lib/supabase";

type SortKey = "newest" | "oldest" | "price_high" | "price_low" | "weight_heavy";
type AdminTab = "items" | "users";

const MAX_WEIGHT_G = 20000; // 行李重量警示門檻：20kg

export default function AdminPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Item["status"]>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [error, setError] = useState("");
  const { toasts, show: showToast, dismiss: dismissToast } = useToast();
  const [activeTab, setActiveTab] = useState<AdminTab>("items");
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState("");

  useEffect(() => {
    localStorage.removeItem("adminPassword");

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthenticated(true);
        loadItems();
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setAuthenticated(false);
        setItems([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) { setError("帳號或密碼錯誤，請確認後再試"); return; }
    setAuthenticated(true);
    loadItems();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setAuthenticated(false);
    setItems([]);
  }

  async function loadItems() {
    setLoading(true);
    try {
      const { getAllItems } = await import("@/lib/supabase");
      setItems(await getAllItems() || []);
    } catch (err) {
      console.error("載入失敗:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const { getAllUsers } = await import("@/lib/supabase");
      setUsers(await getAllUsers());
    } catch (err) {
      console.error("載入使用者失敗:", err);
      showToast("載入使用者失敗", "error");
    } finally {
      setUsersLoading(false);
    }
  }

  async function handleRenameUser(userId: string) {
    const trimmed = editingName.trim();
    if (!trimmed) { showToast("名字不能是空的", "error"); return; }
    try {
      const { renameUser } = await import("@/lib/supabase");
      await renameUser(userId, trimmed);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, name: trimmed } : u));
      setItems((prev) => prev.map((i) => i.user_id === userId ? { ...i, user_name: trimmed } : i));
      setEditingUserId(null);
      showToast("已更新名稱", "success");
    } catch { showToast("更新名稱失敗，可能名字已被使用", "error"); }
  }

  async function handleResetPin(userId: string, userName: string) {
    try {
      const { resetUserPin } = await import("@/lib/supabase");
      await resetUserPin(userId);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, pin_hash: null } : u));
      showToast(`已重設 ${userName} 的 PIN`, "success");
    } catch { showToast("重設 PIN 失敗", "error"); }
  }

  async function handleDeleteUser(userId: string) {
    try {
      const { deleteUser } = await import("@/lib/supabase");
      await deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setItems((prev) => prev.filter((i) => i.user_id !== userId));
      setConfirmDeleteUserId(null);
      showToast("已刪除帳號及其所有商品", "info");
    } catch { showToast("刪除帳號失敗", "error"); }
  }

  const filteredUsers = useMemo(() => {
    if (!userSearchQuery.trim()) return users;
    const q = userSearchQuery.trim().toLowerCase();
    return users.filter((u) => u.name.toLowerCase().includes(q));
  }, [users, userSearchQuery]);

  async function handleStatusChange(
    itemId: string,
    status: Item["status"],
    purchaseDetails?: { actual_price_jpy: number; actual_quantity: number }
  ) {
    try {
      const { updateItemStatus } = await import("@/lib/supabase");
      await updateItemStatus(itemId, status, purchaseDetails ? {
        actual_price_jpy: purchaseDetails.actual_price_jpy,
        actual_quantity: purchaseDetails.actual_quantity,
      } : undefined);
      setItems((prev) => prev.map((i) =>
        i.id === itemId ? {
          ...i,
          status,
          ...(purchaseDetails ? {
            actual_price_jpy: purchaseDetails.actual_price_jpy,
            actual_quantity: purchaseDetails.actual_quantity,
          } : {}),
          updated_at: new Date().toISOString(),
        } : i
      ));
      showToast(status === "bought" ? "已標記為已買到" : "狀態已更新", "success");
    } catch { showToast("更新失敗，請重試", "error"); }
  }

  async function handleItemEdit(itemId: string, fields: EditableItemFields) {
    try {
      const { updateItem } = await import("@/lib/supabase");
      await updateItem(itemId, fields);
      setItems((prev) => prev.map((i) =>
        i.id === itemId ? { ...i, ...fields, updated_at: new Date().toISOString() } : i
      ));
      showToast("已儲存變更", "success");
    } catch { showToast("更新失敗，請重試", "error"); }
  }

  async function handleDelete(itemId: string) {
    try {
      const { deleteItem } = await import("@/lib/supabase");
      await deleteItem(itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      showToast("已刪除商品", "info");
    } catch { showToast("刪除失敗，請重試", "error"); }
  }

  // 搜尋 + 篩選 + 排序
  const uniqueUsers = [...new Set(items.map((i) => i.user_name || "未知"))];

  const filtered = useMemo(() => {
    let result = items;
    if (filter !== "all") result = result.filter((i) => i.status === filter);
    if (userFilter !== "all") result = result.filter((i) => i.user_name === userFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((i) =>
        (i.ai_product_name || "").toLowerCase().includes(q) ||
        (i.ai_product_name_ja || "").toLowerCase().includes(q) ||
        (i.ai_brand || "").toLowerCase().includes(q) ||
        (i.input_text || "").toLowerCase().includes(q) ||
        (i.user_name || "").toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => {
      if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "price_high") return ((b.ai_price_twd || 0) * b.quantity) - ((a.ai_price_twd || 0) * a.quantity);
      if (sortBy === "price_low") return ((a.ai_price_twd || 0) * a.quantity) - ((b.ai_price_twd || 0) * b.quantity);
      if (sortBy === "weight_heavy") return (b.weight_g || 0) - (a.weight_g || 0);
      return 0;
    });
  }, [items, filter, userFilter, searchQuery, sortBy]);

  // 統計
  const stats = {
    total: items.length,
    pending: items.filter((i) => i.status === "pending").length,
    bought: items.filter((i) => i.status === "bought").length,
    totalTwd: items.reduce((sum, i) => sum + (i.ai_price_twd || 0) * (i.quantity || 1), 0),
    totalWeightG: items.reduce((sum, i) => sum + (i.weight_g || 0) * (i.quantity || 1), 0),
  };

  const weightPercent = Math.min((stats.totalWeightG / MAX_WEIGHT_G) * 100, 100);
  const weightOverLimit = stats.totalWeightG > MAX_WEIGHT_G;

  // session 檢查中
  if (loading && !authenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-center">
          <div className="mb-3 text-4xl">🔐</div>
          <div className="shimmer mx-auto h-4 w-32 rounded-full" />
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <div className="w-full max-w-xs">
          <div className="mb-6 text-center">
            <div className="mb-2 text-4xl">🔐</div>
            <h1 className="text-xl font-bold text-gray-900">管理後台</h1>
            <p className="mt-1 text-sm text-gray-500">請使用管理員帳號登入</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-3">
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="管理員 Email"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base shadow-sm focus:border-sakura-400 focus:outline-none focus:ring-2 focus:ring-sakura-200"
              autoFocus autoComplete="email" />
            <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="密碼"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base tracking-widest shadow-sm focus:border-sakura-400 focus:outline-none focus:ring-2 focus:ring-sakura-200"
              autoComplete="current-password" />
            {error && <p className="text-center text-sm text-red-500">{error}</p>}
            <button type="submit" disabled={!email.trim() || !password}
              className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
              進入管理後台
            </button>
          </form>
          <button onClick={() => router.push("/")}
            className="mt-4 block w-full text-center text-sm text-gray-400 hover:text-gray-600">
            ← 回首頁
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-safe-bottom mx-auto min-h-dvh max-w-lg md:max-w-3xl">
      <Toast toasts={toasts} onDismiss={dismissToast} />
      {/* Header */}
      <header className="header-safe sticky top-0 z-10 border-b border-gray-100 bg-white/80 px-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push("/")} className="group text-left" aria-label="回首頁">
            <h1 className="text-lg font-bold text-gray-900 transition-colors group-hover:text-sakura-500">
              🔐 管理後台
            </h1>
          </button>
          <div className="flex gap-2">
            <button onClick={() => { if (activeTab === "users") loadUsers(); else loadItems(); }}
              className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-200">
              🔄 重新整理
            </button>
            <button onClick={handleLogout}
              className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-200">
              登出
            </button>
          </div>
        </div>
      </header>

      {/* 分頁切換 */}
      <div className="flex border-b border-gray-100 px-4">
        <button
          onClick={() => setActiveTab("items")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === "items" ? "border-b-2 border-sakura-500 text-sakura-600" : "text-gray-400 hover:text-gray-600"}`}
        >
          📦 商品管理
        </button>
        <button
          onClick={() => { setActiveTab("users"); if (users.length === 0) loadUsers(); }}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === "users" ? "border-b-2 border-sakura-500 text-sakura-600" : "text-gray-400 hover:text-gray-600"}`}
        >
          👤 帳號管理
        </button>
      </div>

      <main className="space-y-4 px-4 pt-4">
        {activeTab === "users" && (
          <>
            {/* 帳號搜尋 */}
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
              <input
                type="search"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="搜尋帳號名稱..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm focus:border-sakura-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sakura-200"
              />
            </div>

            {/* 帳號統計 */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-gray-50 p-2.5 text-center">
                <p className="text-xl font-bold text-gray-900">{users.length}</p>
                <p className="text-xs text-gray-500">總帳號</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-2.5 text-center">
                <p className="text-xl font-bold text-emerald-600">{users.filter((u) => u.pin_hash).length}</p>
                <p className="text-xs text-gray-500">已設 PIN</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-2.5 text-center">
                <p className="text-xl font-bold text-amber-600">{users.filter((u) => !u.pin_hash).length}</p>
                <p className="text-xs text-gray-500">未設 PIN</p>
              </div>
            </div>

            {/* 帳號列表 */}
            {usersLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="shimmer h-24 rounded-2xl" />)}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 py-12 text-center">
                <p className="text-3xl">{userSearchQuery ? "🔍" : "👤"}</p>
                <p className="mt-2 text-sm text-gray-400">
                  {users.length === 0 ? "還沒有任何帳號" : `找不到符合「${userSearchQuery}」的帳號`}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredUsers.map((user) => (
                  <div key={user.id} className="card-hover rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      {/* 左側：名稱 + 資訊 */}
                      <div className="min-w-0 flex-1">
                        {editingUserId === user.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="min-w-0 flex-1 rounded-lg border border-sakura-200 px-3 py-1.5 text-sm focus:border-sakura-400 focus:outline-none focus:ring-1 focus:ring-sakura-200"
                              autoFocus
                              onKeyDown={(e) => { if (e.key === "Enter") handleRenameUser(user.id); if (e.key === "Escape") setEditingUserId(null); }}
                            />
                            <button onClick={() => handleRenameUser(user.id)}
                              className="rounded-lg bg-sakura-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sakura-600">
                              儲存
                            </button>
                            <button onClick={() => setEditingUserId(null)}
                              className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200">
                              取消
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-semibold text-gray-900">{user.name}</h3>
                            {user.pin_hash ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-600">PIN 已設定</span>
                            ) : (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-600">未設 PIN</span>
                            )}
                          </div>
                        )}
                        <p className="mt-1 text-xs text-gray-400">
                          建立於 {new Date(user.created_at).toLocaleDateString("zh-TW")}
                        </p>
                        {/* 商品統計 */}
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                            {user.item_count} 件商品
                          </span>
                          {user.pending_count > 0 && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-600">
                              {user.pending_count} 待處理
                            </span>
                          )}
                          {user.bought_count > 0 && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-600">
                              {user.bought_count} 已買到
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 右側：操作按鈕 */}
                      {editingUserId !== user.id && (
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={() => { setEditingUserId(user.id); setEditingName(user.name); }}
                            className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-200"
                            title="重新命名"
                          >
                            ✏️ 改名
                          </button>
                          {user.pin_hash && (
                            <button
                              onClick={() => handleResetPin(user.id, user.name)}
                              className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-600 transition-colors hover:bg-amber-100"
                              title="清除 PIN，下次登入需重新設定"
                            >
                              🔓 重設 PIN
                            </button>
                          )}
                          {confirmDeleteUserId === user.id ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleDeleteUser(user.id)}
                                className="rounded-lg bg-red-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-600"
                              >
                                確認刪除
                              </button>
                              <button
                                onClick={() => setConfirmDeleteUserId(null)}
                                className="rounded-lg bg-gray-100 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-200"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteUserId(user.id)}
                              className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-100"
                              title="刪除帳號及其所有商品"
                            >
                              🗑️ 刪除
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "items" && (<>
        {/* 統計卡片 */}
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-xl bg-gray-50 p-2.5 text-center">
            <p className="text-xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-500">總商品</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-2.5 text-center">
            <p className="text-xl font-bold text-amber-600">{stats.pending}</p>
            <p className="text-xs text-gray-500">待處理</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-2.5 text-center">
            <p className="text-xl font-bold text-emerald-600">{stats.bought}</p>
            <p className="text-xs text-gray-500">已買到</p>
          </div>
          <div className="rounded-xl bg-sakura-50 p-2.5 text-center">
            <p className="text-xl font-bold text-sakura-600">
              ${(stats.totalTwd / 1000).toFixed(1)}k
            </p>
            <p className="text-xs text-gray-500">預估</p>
          </div>
        </div>

        {/* 行李重量卡片（只在有重量資料時顯示） */}
        {stats.totalWeightG > 0 && (
          <div className={`rounded-xl p-3 ${weightOverLimit ? "bg-orange-50 border border-orange-200" : "bg-gray-50"}`}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className={`font-medium ${weightOverLimit ? "text-orange-600" : "text-gray-600"}`}>
                ⚖️ 行李重量（有填重量的商品）
              </span>
              <span className={`font-bold ${weightOverLimit ? "text-orange-600" : "text-gray-700"}`}>
                {(stats.totalWeightG / 1000).toFixed(2)} kg / 20 kg
                {weightOverLimit && " ⚠️ 超重！"}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full transition-all ${weightOverLimit ? "bg-orange-500" : "bg-emerald-500"}`}
                style={{ width: `${weightPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* 搜尋 + 排序 */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋商品或使用者..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm focus:border-sakura-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sakura-200"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-600 focus:border-sakura-300 focus:outline-none"
          >
            <option value="newest">最新</option>
            <option value="oldest">最舊</option>
            <option value="price_high">價格高→低</option>
            <option value="price_low">價格低→高</option>
            <option value="weight_heavy">重量重→輕</option>
          </select>
        </div>

        {/* 篩選器 */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setUserFilter("all")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${userFilter === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              全部人 ({items.length})
            </button>
            {uniqueUsers.map((name) => (
              <button key={name} onClick={() => setUserFilter(name)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${userFilter === name ? "bg-sakura-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {name} ({items.filter((i) => i.user_name === name).length})
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setFilter("all")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              全部
            </button>
            {(Object.keys(STATUS_MAP) as Item["status"][]).map((status) => (
              <button key={status} onClick={() => setFilter(status)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === status ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {STATUS_MAP[status]} ({items.filter((i) => i.status === status).length})
              </button>
            ))}
          </div>
        </div>

        {/* 商品列表 */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="shimmer h-32 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 py-12 text-center">
            <p className="text-3xl">{searchQuery ? "🔍" : "📭"}</p>
            <p className="mt-2 text-sm text-gray-400">
              {items.length === 0 ? "還沒有人提交商品" : searchQuery ? `找不到符合「${searchQuery}」的商品` : "篩選條件下沒有商品"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filtered.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                showUser
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onEdit={handleItemEdit}
              />
            ))}
          </div>
        )}
        </>)}
      </main>
    </div>
  );
}
