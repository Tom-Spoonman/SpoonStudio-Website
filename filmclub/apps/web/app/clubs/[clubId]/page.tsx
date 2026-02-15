import FilmclubClient from "../../FilmclubClient";

export default function ClubPage({
  params
}: {
  params: { clubId: string };
}) {
  return <FilmclubClient view="club" routeClubId={params.clubId} />;
}
