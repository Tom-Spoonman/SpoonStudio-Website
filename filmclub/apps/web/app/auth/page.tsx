import { Suspense } from "react";
import FilmclubClient from "../FilmclubClient";

export default function AuthPage() {
  return (
    <Suspense fallback={<main><p>Loading...</p></main>}>
      <FilmclubClient view="auth" />
    </Suspense>
  );
}
