import { createFileRoute } from "@tanstack/react-router";
import { OAuthFlow } from "~/components/oauth-flow";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  return (
    <div className="mx-auto max-w-md space-y-6 pt-8 animate-fade-in">
      <h1 className="text-sm font-medium">Authentication</h1>
      <OAuthFlow />
    </div>
  );
}
