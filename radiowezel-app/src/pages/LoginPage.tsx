import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { api, isApiTimeoutError } from "@/lib/api";
import { resolveSchoolEmail, schoolEmailDomain } from "@/lib/schoolEmail";
import { SchoolEmailInput } from "@/components/SchoolEmailInput";

const PASSWORD_LOGIN_KEY = "showPasswordLogin";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const domain = schoolEmailDomain();
  const [showPasswordLogin, setShowPasswordLogin] = useState(() =>
    typeof window !== "undefined" && sessionStorage.getItem(PASSWORD_LOGIN_KEY) === "1"
  );
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/";
  const { login } = useAuth();
  const { toast } = useToast();

  const updateEmail = (value: string) => {
    setEmail(value);
    if (emailError) {
      setEmailError("");
    }
  };

  const rejectEmail = (reason: "empty" | "plus" | "invalid-domain"): void => {
    if (reason === "invalid-domain") {
      setEmailError(`Dozwolone są tylko adresy @${domain}`);
      return;
    }
    setEmailError("");
    if (reason === "plus") {
      toast({
        title: "Nieprawidłowy adres",
        description: "Adres e-mail nie może zawierać znaku +",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Podaj adres e-mail", variant: "destructive" });
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast({ title: "Uzupełnij email i hasło", variant: "destructive" });
      return;
    }
    const resolved = resolveSchoolEmail(email, domain);
    if (!resolved.ok) {
      rejectEmail(resolved.reason);
      return;
    }
    setEmailError("");
    setLoading(true);
    try {
      await login(resolved.email, password);
      toast({ title: "Zalogowano" });
      navigate(redirect, { replace: true });
    } catch (err) {
      if (!isApiTimeoutError(err)) {
        toast({ title: "Błąd logowania", description: (err as Error).message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const resolved = resolveSchoolEmail(email, domain);
    if (!resolved.ok) {
      rejectEmail(resolved.reason);
      return;
    }
    setEmailError("");
    const address = resolved.email.toLowerCase();

    setLoading(true);
    try {
      await api.sendMagicLink(address);
      setSentTo(address);
      setSent(true);
      toast({ title: "Wysłano link", description: "Sprawdź skrzynkę i kliknij link do logowania." });
    } catch (e) {
      if (!isApiTimeoutError(e)) {
        toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
      }
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
              Wysłaliśmy link do logowania na adres {sentTo}. Kliknij go, aby się zalogować. Link jest ważny 1 godzinę.
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
            Wpisz login lub adres @{domain}. Sam login uzupełnimy o tę domenę. Wyślemy link – po kliknięciu będziesz zalogowany.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleMagicLink} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <SchoolEmailInput id="email" value={email} onChange={updateEmail} error={emailError} disabled={loading} domain={domain} />
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
            {" · "}
            <Link to="/public/history" className="text-primary underline">
              Historia odtwarzania
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
                <SchoolEmailInput id="pw-email" value={email} onChange={updateEmail} error={emailError} disabled={loading} domain={domain} />
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
