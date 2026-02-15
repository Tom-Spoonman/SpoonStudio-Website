import { Suspense } from "react";
import FilmclubClient from "../FilmclubClient";

export default function ClubsPage() {
  return (
    <Suspense fallback={<main><p>Loading...</p></main>}>
      <FilmclubClient view="clubs" />
    </Suspense>
  );
}
