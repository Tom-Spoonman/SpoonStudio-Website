import FilmclubClient from "../../../FilmclubClient";

export default function ClubProposalsPage({
  params
}: {
  params: { clubId: string };
}) {
  return <FilmclubClient view="proposals" routeClubId={params.clubId} />;
}
