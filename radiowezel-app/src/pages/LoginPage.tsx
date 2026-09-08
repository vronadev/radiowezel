import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { ALLOWED_EMAIL_DOMAIN } from "@/types/api";

const PASSWORD_LOGIN_KEY = "showPasswordLogin";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [showPasswordLogin, setShowPasswordLogin] = useState(() =>
    typeof window !== "undefined" && sessionStorage.getItem(PASSWORD_LOGIN_KEY) === "1"
  );
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/";
  const { login } = useAuth();
  const { toast } = useToast();

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast({ title: "Uzupełnij email i hasło", variant: "destructive" });
      return;
    }
    if (!email.trim().toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      toast({ title: `Dozwolone tylko adresy @${ALLOWED_EMAIL_DOMAIN}`, variant: "destructive" });
      return;
    }
    if(email.includes("+")) {
      toast({
        title: "Nieprawidłowy adres",
        description: "Adres e-mail nie może zawierać znaku +",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      toast({ title: "Zalogowano" });
      navigate(redirect, { replace: true });
    } catch (err) {
      toast({ title: "Błąd logowania", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({ title: "Podaj adres e-mail", variant: "destructive" });
      return;
    }
    if (!email.trim().toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      toast({
        title: "Nieprawidłowa domena",
        description: `Dozwolone są tylko adresy @${ALLOWED_EMAIL_DOMAIN}`,
        variant: "destructive",
      });
      return;
    }

    if(email.includes("+")) {
      toast({
        title: "Nieprawidłowy adres",
        description: "Adres e-mail nie może zawierać znaku +",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await api.sendMagicLink(email.trim().toLowerCase());
      setSent(true);
      toast({ title: "Wysłano link", description: "Sprawdź skrzynkę i kliknij link do logowania." });
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sprawdź e-mail</CardTitle>
            <CardDescription>
              Wysłaliśmy link do logowania na adres {email}. Kliknij go, aby się zalogować. Link jest ważny 1 godzinę.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
              Wróć i wpisz inny adres
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Logowanie</CardTitle>
          <CardDescription>
            Wpisz adres e-mail szkolny (@{ALLOWED_EMAIL_DOMAIN}). Wyślemy Ci link – po kliknięciu będziesz zalogowany.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleMagicLink} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder={`user@${ALLOWED_EMAIL_DOMAIN}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Wysyłanie…" : "Wyślij link do logowania"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            Nie masz konta?{" "}
            <Link to="/register" className="text-primary underline">
              Zarejestruj się
            </Link>
          </p>
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/public/queue" className="text-primary underline">
              Zobacz kolejkę bez logowania
            </Link>
          </p>
          {!showPasswordLogin ? (
            <p className="text-center">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:underline"
                onClick={() => {
                  setShowPasswordLogin(true);
                  sessionStorage.setItem(PASSWORD_LOGIN_KEY, "1");
                }}
              >
                Zaloguj się hasłem (np. admin)
              </button>
            </p>
          ) : (
            <form onSubmit={handlePasswordLogin} className="space-y-4 rounded-lg border p-4">
              <p className="text-sm font-medium">Logowanie hasłem</p>
              <div className="space-y-2">
                <Label htmlFor="pw-email">Email</Label>
                <Input
                  id="pw-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={`user@${ALLOWED_EMAIL_DOMAIN}`}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw-password">Hasło</Label>
                <Input
                  id="pw-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" variant="secondary" className="w-full" disabled={loading}>
                Zaloguj hasłem
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
