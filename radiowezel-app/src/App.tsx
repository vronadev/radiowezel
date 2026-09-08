import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { Toaster } from "@/components/ui/toaster";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QueueView } from "@/pages/QueueView";
import { VoteView } from "@/pages/VoteView";
import { AdminView } from "@/pages/AdminView";
import { AdminPlaylistView } from "@/pages/AdminPlaylistView";
import { PlaylistView } from "@/pages/PlaylistView";
import { RankingView } from "@/pages/RankingView";
import { RequestsView } from "@/pages/RequestsView";
import { PublicQueueView } from "@/pages/PublicQueueView";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { VerifyPage } from "@/pages/VerifyPage";
import { api } from "@/lib/api";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { User, LogOut, Moon, Sun, ListMusic } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { VoteQuotaBadge } from "@/components/VoteQuotaBadge";
import { HistoryView } from "@/pages/HistoryView";

function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [effectivePlaylist, setEffectivePlaylist] = useState<{ playlistId: string | null; playlistName: string | null } | null>(null);

  useEffect(() => {
    api.getEffectivePlaylist().then(setEffectivePlaylist).catch(() => setEffectivePlaylist({ playlistId: null, playlistName: null }));
  }, [location.pathname]);

  const tab =
    location.pathname === "/vote"
      ? "vote"
      : location.pathname.startsWith("/admin")
        ? "admin"
        : location.pathname.startsWith("/playlist")
          ? "queue"
          : location.pathname === "/ranking"
            ? "ranking"
            : location.pathname === "/history"
              ? "history"
              : "queue";

  return (
    <div className="min-h-screen flex flex-col">
      {effectivePlaylist?.playlistName && (
        <div className="bg-muted/60 border-b px-4 py-1.5 text-sm text-muted-foreground flex items-center gap-2 min-w-0">
          <ListMusic className="h-4 w-4 shrink-0" />
          <span className="shrink-0">Obowiązuje playlista:</span>
          <Link to={`/playlist/${effectivePlaylist.playlistId}`} className="font-medium text-foreground hover:underline truncate">
            {effectivePlaylist.playlistName}
          </Link>
        </div>
      )}
      {effectivePlaylist && effectivePlaylist.playlistId === null && (
        <div className="bg-muted/40 border-b px-4 py-1 text-xs text-muted-foreground">
          Brak ograniczenia playlisty - można głosować na wszystkie zweryfikowane piosenki.
        </div>
      )}
      <header className="border-b bg-card px-2 sm:px-4 py-3 flex items-center justify-between gap-2 min-w-0">
        <Tabs value={tab} onValueChange={(v) => navigate(v === "queue" ? "/" : `/${v}`)} className="min-w-0 overflow-x-auto">
          <TabsList className="h-9">
            <TabsTrigger value="queue" asChild className="px-2 sm:px-3 text-xs sm:text-sm">
              <Link to="/">Kolejka</Link>
            </TabsTrigger>
            <TabsTrigger value="vote" asChild className="px-2 sm:px-3 text-xs sm:text-sm">
              <Link to="/vote">Głosowanie</Link>
            </TabsTrigger>
            <TabsTrigger value="ranking" asChild className="px-2 sm:px-3 text-xs sm:text-sm">
              <Link to="/ranking">Ranking</Link>
            </TabsTrigger>
            <TabsTrigger value="history" asChild className="px-2 sm:px-3 text-xs sm:text-sm">
              <Link to="/history">Historia</Link>
            </TabsTrigger>
            {user?.isAdmin && (
              <TabsTrigger value="admin" asChild className="px-2 sm:px-3 text-xs sm:text-sm">
                <Link to="/admin">Admin</Link>
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2 shrink-0">
          <VoteQuotaBadge />
          <Button variant="ghost" size="icon" onClick={toggleTheme} title={theme === "dark" ? "Tryb jasny" : "Tryb ciemny"}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <User className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled>
              {user?.email}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { logout(); navigate("/login"); }}>
              <LogOut className="mr-2 h-4 w-4" />
              Wyloguj
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      {/* <Toaster /> */}
    </div>
  );
}

function ProtectedRoute({ children, adminOnly }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center">Ładowanie…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !user.isAdmin) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster />
      <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth/verify" element={<VerifyPage />} />
          <Route path="/public/queue" element={<PublicQueueView />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <QueueView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vote"
            element={
              <ErrorBoundary>
                <ProtectedRoute>
                  <VoteView />
                </ProtectedRoute>
              </ErrorBoundary>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly>
                <AdminView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/playlist/:playlistId"
            element={
              <ProtectedRoute adminOnly>
                <AdminPlaylistView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/playlist/:playlistId"
            element={
              <ProtectedRoute>
                <PlaylistView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <HistoryView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ranking"
            element={
              <ProtectedRoute>
                <RankingView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/requests"
            element={
              <ProtectedRoute>
                <RequestsView />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
