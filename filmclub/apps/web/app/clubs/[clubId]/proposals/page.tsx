import { Suspense } from "react";
import FilmclubClient from "../../../FilmclubClient";

export default async function ClubProposalsPage({
  params
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  return (
    <Suspense fallback={<main><p>Loading...</p></main>}>
      <FilmclubClient view="proposals" routeClubId={clubId} />
    </Suspense>
  );
}
