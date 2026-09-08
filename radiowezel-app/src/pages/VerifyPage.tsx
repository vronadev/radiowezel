import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

export function VerifyPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      toast({ title: "Brak tokenu", variant: "destructive" });
      return;
    }

    (async () => {
      try {
        // sets cookie
        await api.verifyToken(token);

        // fetch user from cookie session
        const { user } = await api.me();

        setUser(user);

        setStatus("ok");
        toast({ title: "Zalogowano" });

        navigate("/", { replace: true });
      } catch {
        setStatus("error");
        toast({
          title: "Link wygasł lub jest nieprawidłowy",
          variant: "destructive",
        });
      }
    })();
  }, [token]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Logowanie…</CardTitle>
            <CardDescription>Trwa weryfikacja linku.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Błąd</CardTitle>
            <CardDescription>
              Link wygasł lub jest nieprawidłowy. Poproś o nowy link do logowania.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              type="button"
              className="text-primary underline"
              onClick={() => navigate("/login", { replace: true })}
            >
              Wróć do logowania
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}